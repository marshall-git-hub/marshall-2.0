#python -m PyInstaller --onefile --icon=scripts\update_km\icon.ico scripts\update_km\script.py

from pywinauto import Application, keyboard, mouse
import pyautogui
from pywinauto.keyboard import send_keys
import time
import cv2
import numpy as np
from PIL import ImageGrab
import os

def capture_screenshot(region=None):
    # Capture a screenshot of the specified region
    screenshot = ImageGrab.grab(bbox=region)
    return screenshot

def find_image(template_path, screenshot, threshold=0.7):
    # Load the template image
    if not os.path.exists(template_path):
        return None, None, 0.0
    
    template = cv2.imread(template_path, cv2.IMREAD_GRAYSCALE)
    if template is None:
        return None, None, 0.0
    
    template_w, template_h = template.shape[::-1]
    
    # Convert screenshot to grayscale
    screenshot_np = np.array(screenshot)
    gray_screenshot = cv2.cvtColor(screenshot_np, cv2.COLOR_BGR2GRAY)
    
    # Perform template matching
    res = cv2.matchTemplate(gray_screenshot, template, cv2.TM_CCOEFF_NORMED)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
    
    # Return position, size, and confidence value
    if max_val >= threshold:
        return max_loc, (template_w, template_h), max_val
    else:
        return None, None, max_val

def find_and_click(region, template_path, double=False, max_retries=3, threshold=0.7):
    for attempt in range(max_retries):
        time.sleep(0.5)
        screenshot = capture_screenshot(region)
        position, size, confidence = find_image(template_path, screenshot, threshold)
        
        if position:
            x, y = position
            width, height = size
            if double == False:
                mouse.click(coords=(x + width // 2, y + height // 2))
            return True
        else:
            if attempt < max_retries - 1:
                time.sleep(0.5)  # Wait before retry
    
    return False

region = (0, 0, 1920, 1080)

# Get the directory where this script is located (update_km)
script_dir = os.path.dirname(os.path.abspath(__file__))
find_dir = os.path.join(script_dir, "find")

def main():
    # Path to the executable
    app_path = r"C:\Doprava3K\InfosysMain.exe"

    # Start the application
    app = Application(backend="uia").start(app_path)
    time.sleep(2)  # Adjust delay as necessary for the application to fully load

    try:
        # Specify the main window
        window_title = "Přihlášení do databáze"
        main_window = app.window(title=window_title)
        main_window.wait("visible", timeout=10)
        
        # Input password
        password_field = main_window.child_window(control_type="Edit", found_index=0)
        password_field.type_keys("8344")

        # Click OK button
        ok_button = main_window.child_window(title="OK", control_type="Button")
        ok_button.click()

        # Wait for the first popup window to appear and click "Ne"
        try:
            first_popup_title = "Doprava 4K"
            first_popup_window = app.window(title=first_popup_title)
            first_popup_window.wait("visible", timeout=20)
            ne_button = first_popup_window.child_window(title="Ne", control_type="Button")
            ne_button.click()
            time.sleep(0.5)
        except Exception:
            pass

        # Wait for the second popup window to appear and click "Ne"
        try:
            second_popup_title = "Doprava 4K"
            second_popup_window = app.window(title=second_popup_title)
            second_popup_window.wait("visible", timeout=10)
            ne_button2 = second_popup_window.child_window(title="Ne", control_type="Button")
            ne_button2.click()
            time.sleep(0.5)
        except Exception:
            pass

        # Find Doprava button
        doprava_found = find_and_click(region, os.path.join(find_dir, "Doprava_button.png"), threshold=0.6, max_retries=5)
        if not doprava_found:
            doprava_found = find_and_click(region, os.path.join(find_dir, "Doprava_button.png"), threshold=0.5, max_retries=3)
        time.sleep(0.3)

        # Find and click Vozidla buttons
        find_and_click(region, os.path.join(find_dir, "Vozidla1_button.png"))
        time.sleep(0.3)
        find_and_click(region, os.path.join(find_dir, "Vozidla2_button.png"))

        # Wait before Excel export
        time.sleep(5)
        find_and_click(region, os.path.join(find_dir, "excel_button_find.png"))
        time.sleep(0.3)

        # Handle "Save As" window
        save_as_title = "Save As"
        save_as_window = app.window(title=save_as_title)
        try:
            save_as_window.wait("visible", timeout=10)
        except Exception as e:
            print(f"Error: Timeout waiting for 'Save As' window: {e}")
            raise

        # Use the keyboard to focus on the address bar and type the path
        save_as_window.set_focus()
        keyboard.send_keys("^l")  # Ctrl + L to focus the address bar
        keyboard.send_keys(r"Z:\Jakub\scripts\MarshallApp\scripts\update_km\{ENTER}")

        time.sleep(1)

        # Find the "File name:" edit field and type "current_km"
        file_name_field = save_as_window.child_window(title="File name:", control_type="Edit")
        file_name_field.set_focus()
        file_name_field.type_keys("current_km")

        # Press Enter to save
        keyboard.send_keys("{ENTER}")
        
        # Wait for file to be saved before uploading to Firebase
        time.sleep(2)
        
        # Upload to Firebase after file is saved
        upload_vozidla_data_to_firestore()

    except Exception as e:
        print(f"Error: {str(e)}")
    finally:
        time.sleep(2)
        app.kill()






# Firebase Firestore data upload from current_km.xlsx
import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd

def upload_vozidla_data_to_firestore():
    try:
        # Get script directory for file paths
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Path to service account key (project root, one level above /scripts)
        scripts_dir = os.path.dirname(script_dir)
        project_root = os.path.dirname(scripts_dir)
        service_account_path = os.path.join(project_root, "serviceAccountKey.json")
        
        # Initialize Firebase
        if not os.path.exists(service_account_path):
            print(f"Error: Service account key not found at {service_account_path}")
            return False
            
        cred = credentials.Certificate(service_account_path)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        db = firestore.client()

        # Read current_km.xlsx file
        vozidla_file = os.path.join(script_dir, "current_km.xls")
        if not os.path.exists(vozidla_file):
            print(f"Error: File not found: {vozidla_file}")
            return False
            
        df = pd.read_excel(vozidla_file)
        
        # Extract data from columns B (name) and S (kilometers)
        # Note: pandas uses 0-based indexing, so column B is index 1, column S is index 18
        vehicles_dict = {}
        
        for index, row in df.iterrows():
            name = row.iloc[1]  # Column B (index 1)
            kilometers = row.iloc[18]  # Column S (index 18)
            
            # Skip rows where name is empty or NaN
            if pd.notna(name) and str(name).strip() != "":
                spz = str(name).strip().replace(" ", "")
                km_value = int(kilometers) if pd.notna(kilometers) else 0
                vehicles_dict[spz] = km_value
        
        # Update SHARED/vehicles_km document
        vehicles_km_doc = db.collection("SHARED").document("vehicles_km")
        vehicles_km_doc.set(vehicles_dict)
        
        print(f"Successfully uploaded {len(vehicles_dict)} vehicle records to Firebase (SHARED/vehicles_km)!")
        return True
        
    except Exception as e:
        print(f"Error uploading vehicle kilometers to Firebase: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    main()
    input("Press Enter to close.")
