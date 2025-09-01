import os
import sys
import argparse
from pathlib import Path
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import cv2
import numpy as np
import json
from datetime import datetime

class PDFOCRExtractor:
    def __init__(self, tesseract_path=None):
        """
        Initialize the PDF OCR Extractor
        
        Args:
            tesseract_path (str): Path to tesseract executable (for Windows)
        """
        self.tesseract_path = tesseract_path
        if tesseract_path:
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
        
        # Check if tesseract is available
        try:
            pytesseract.get_tesseract_version()
            print("✓ Tesseract OCR is available")
        except Exception as e:
            print(f"✗ Tesseract OCR not found: {e}")
            print("Please install Tesseract OCR: https://github.com/tesseract-ocr/tesseract")
            sys.exit(1)
    
    def preprocess_image(self, image):
        """
        Preprocess image for better OCR results
        
        Args:
            image: PIL Image object
            
        Returns:
            PIL Image: Preprocessed image
        """
        # Convert to numpy array for OpenCV processing
        img_array = np.array(image)
        
        # Convert to grayscale if not already
        if len(img_array.shape) == 3:
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_array
        
        # Apply thresholding to get binary image
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Apply morphological operations to clean up the image
        kernel = np.ones((1, 1), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        
        # Convert back to PIL Image
        return Image.fromarray(cleaned)
    
    def extract_text_from_image(self, image, language='eng'):
        """
        Extract text from a single image
        
        Args:
            image: PIL Image object
            language (str): OCR language code (default: 'eng' for English)
            
        Returns:
            str: Extracted text
        """
        try:
            # Preprocess the image
            processed_image = self.preprocess_image(image)
            
            # Extract text using Tesseract
            text = pytesseract.image_to_string(processed_image, lang=language)
            
            return text.strip()
        except Exception as e:
            print(f"Error extracting text from image: {e}")
            return ""
    
    def extract_text_from_pdf(self, pdf_path, output_format='txt', language='eng', 
                            start_page=None, end_page=None, output_dir=None):
        """
        Extract text from PDF file using OCR
        
        Args:
            pdf_path (str): Path to PDF file
            output_format (str): Output format ('txt', 'json', 'csv')
            language (str): OCR language code
            start_page (int): Starting page (0-indexed)
            end_page (int): Ending page (0-indexed)
            output_dir (str): Output directory for results
            
        Returns:
            dict: Results with extracted text and metadata
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        
        # Create output directory if specified
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        
        # Open PDF
        pdf_document = fitz.open(pdf_path)
        total_pages = len(pdf_document)
        
        print(f"Processing PDF: {pdf_path}")
        print(f"Total pages: {total_pages}")
        print(f"Language: {language}")
        
        # Set page range
        if start_page is None:
            start_page = 0
        if end_page is None:
            end_page = total_pages - 1
        
        # Validate page range
        start_page = max(0, min(start_page, total_pages - 1))
        end_page = max(start_page, min(end_page, total_pages - 1))
        
        results = {
            'pdf_path': pdf_path,
            'total_pages': total_pages,
            'processed_pages': end_page - start_page + 1,
            'language': language,
            'extraction_time': datetime.now().isoformat(),
            'pages': []
        }
        
        extracted_text = []
        
        # Process each page
        for page_num in range(start_page, end_page + 1):
            print(f"Processing page {page_num + 1}/{total_pages}...")
            
            page = pdf_document[page_num]
            
            # Get page as image
            mat = fitz.Matrix(2.0, 2.0)  # Scale factor for better quality
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PIL Image
            img_data = pix.tobytes("png")
            image = Image.open(io.BytesIO(img_data))
            
            # Extract text
            text = self.extract_text_from_image(image, language)
            
            page_result = {
                'page_number': page_num + 1,
                'text': text,
                'text_length': len(text),
                'has_text': bool(text.strip())
            }
            
            results['pages'].append(page_result)
            extracted_text.append(text)
            
            print(f"  ✓ Extracted {len(text)} characters")
        
        pdf_document.close()
        
        # Combine all text
        full_text = '\n\n'.join(extracted_text)
        results['full_text'] = full_text
        results['total_characters'] = len(full_text)
        
        # Save results based on output format
        if output_dir:
            base_name = Path(pdf_path).stem
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            if output_format == 'txt':
                output_file = os.path.join(output_dir, f"{base_name}_extracted_{timestamp}.txt")
                with open(output_file, 'w', encoding='utf-8') as f:
                    f.write(full_text)
                print(f"✓ Text saved to: {output_file}")
                
            elif output_format == 'json':
                output_file = os.path.join(output_dir, f"{base_name}_extracted_{timestamp}.json")
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(results, f, indent=2, ensure_ascii=False)
                print(f"✓ JSON results saved to: {output_file}")
                
            elif output_format == 'csv':
                output_file = os.path.join(output_dir, f"{base_name}_extracted_{timestamp}.csv")
                import csv
                with open(output_file, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f)
                    writer.writerow(['Page', 'Text', 'Character Count'])
                    for page in results['pages']:
                        writer.writerow([page['page_number'], page['text'], page['text_length']])
                print(f"✓ CSV results saved to: {output_file}")
        
        return results

def main():
    parser = argparse.ArgumentParser(description='Extract text from PDF using OCR')
    parser.add_argument('pdf_path', help='Path to PDF file')
    parser.add_argument('--language', '-l', default='eng', 
                       help='OCR language code (default: eng)')
    parser.add_argument('--output-format', '-f', choices=['txt', 'json', 'csv'], 
                       default='txt', help='Output format (default: txt)')
    parser.add_argument('--output-dir', '-o', help='Output directory')
    parser.add_argument('--start-page', '-s', type=int, help='Starting page (0-indexed)')
    parser.add_argument('--end-page', '-e', type=int, help='Ending page (0-indexed)')
    parser.add_argument('--tesseract-path', help='Path to tesseract executable (Windows)')
    
    args = parser.parse_args()
    
    # Initialize extractor
    extractor = PDFOCRExtractor(tesseract_path=args.tesseract_path)
    
    try:
        # Extract text
        results = extractor.extract_text_from_pdf(
            pdf_path=args.pdf_path,
            output_format=args.output_format,
            language=args.language,
            start_page=args.start_page,
            end_page=args.end_page,
            output_dir=args.output_dir
        )
        
        print(f"\n✓ Extraction completed successfully!")
        print(f"Total characters extracted: {results['total_characters']}")
        print(f"Pages processed: {results['processed_pages']}")
        
        # Display first 500 characters of extracted text
        if results['full_text']:
            print(f"\nFirst 500 characters of extracted text:")
            print("-" * 50)
            print(results['full_text'][:500])
            if len(results['full_text']) > 500:
                print("...")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import io  # Import here for BytesIO
    main()
