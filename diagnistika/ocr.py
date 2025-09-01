import pytesseract
from PIL import Image
import os

# Nastavenie cesty k Tesseract (uprav podľa svojej inštalácie)
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def ocr_from_image(image_path):
    try:
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img, lang='ces')
        return text
    except Exception as e:
        print(f"Chyba pri spracovaní {image_path}: {e}")
        return None

def process_images_in_directory(directory):
    combined_text = ""
    for filename in sorted(os.listdir(directory)):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            image_path = os.path.join(directory, filename)
            print(f"Spracovávam: {filename}")
            text = ocr_from_image(image_path)
            if text:
                combined_text += f"--- {filename} ---\n{text}\n\n"

    # Uloženie všetkého textu do jedného súboru
    output_file = os.path.join(directory, "vystup.txt")
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(combined_text)
    print(f"Výsledok uložený do: {output_file}")

# Tu nastav priečinok s obrázkami
process_images_in_directory(r'C:\Users\JakubM.Maruska_Jakub\Desktop\marshall-2.0\diagnistika\input')
