from flask import Flask, render_template, request, jsonify, send_file
from PIL import Image
import io
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import json
import os
from datetime import datetime, timedelta
import math
import time

app = Flask(__name__)

# Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default-secret-key')
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024  # 8MB max upload

# Encryption Settings
KEY_SIZE = 32  # 256-bit key
BLOCK_SIZE = 16  # AES block size

def encrypt_text(text, password):
    salt = os.urandom(16)
    key = pad(password.encode(), KEY_SIZE)[:KEY_SIZE]
    cipher = AES.new(key, AES.MODE_CBC, salt)
    ciphertext = cipher.encrypt(pad(text.encode(), BLOCK_SIZE))
    return base64.b64encode(salt + ciphertext).decode()

def decrypt_text(encrypted_text, password):
    try:
        data = base64.b64decode(encrypted_text)
        salt, ciphertext = data[:16], data[16:]
        key = pad(password.encode(), KEY_SIZE)[:KEY_SIZE]
        cipher = AES.new(key, AES.MODE_CBC, salt)
        decrypted = unpad(cipher.decrypt(ciphertext), BLOCK_SIZE).decode()
        return decrypted
    except Exception as e:
        print(f"Decryption error: {str(e)}")
        return None

def calculate_distance(lat1, lon1, lat2, lon2):
    # Haversine formula implementation
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371  # Earth radius in km
    return c * r

def hide_data_in_image(image_path, text, password, expiry=None, location=None):
    try:
        img = Image.open(image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        payload = {
            'text': encrypt_text(text, password),
            'expiry': expiry.isoformat() if expiry else None,
            'location': location
        }
        binary_data = ''.join(format(ord(c), '08b') for c in json.dumps(payload)) + '00000000'
        
        pixels = img.load()
        width, height = img.size
        data_index = 0
        
        for y in range(height):
            for x in range(width):
                if data_index >= len(binary_data):
                    break
                r, g, b = pixels[x, y]
                if data_index < len(binary_data):
                    r = (r & 0xFE) | int(binary_data[data_index])
                    data_index += 1
                if data_index < len(binary_data):
                    g = (g & 0xFE) | int(binary_data[data_index])
                    data_index += 1
                if data_index < len(binary_data):
                    b = (b & 0xFE) | int(binary_data[data_index])
                    data_index += 1
                pixels[x, y] = (r, g, b)
        
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        return img_byte_arr
    except Exception as e:
        print(f"Error hiding data: {str(e)}")
        raise

def extract_data_from_image(image_path, password):
    try:
        print(f"[{datetime.now()}] Starting extraction...")
        start_time = time.time()
        
        img = Image.open(image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        binary_data = ''
        pixels = img.load()
        width, height = img.size
        
        # Process only first 1000px for faster extraction
        max_pixels = 1000
        processed_pixels = 0
        
        for y in range(height):
            for x in range(width):
                if processed_pixels >= max_pixels:
                    break
                r, g, b = pixels[x, y]
                binary_data += str(r & 1) + str(g & 1) + str(b & 1)
                processed_pixels += 1
        
        end_index = binary_data.find('00000000')
        if end_index == -1:
            return {'error': 'No hidden data found in image'}
        
        data_str = ''.join(chr(int(binary_data[i:i+8], 2)) for i in range(0, end_index, 8))
        print(f"[{datetime.now()}] Data extracted in {time.time()-start_time:.2f}s")
        
        try:
            payload = json.loads(data_str)
            
            if payload.get('expiry'):
                if datetime.now() > datetime.fromisoformat(payload['expiry']):
                    return {'error': 'Message has expired'}
            
            if payload.get('location'):
                if not request.form.get('current_lat') or not request.form.get('current_lng'):
                    return {'error': 'Location access required'}
                
                try:
                    current_lat = float(request.form.get('current_lat'))
                    current_lng = float(request.form.get('current_lng'))
                    stored_lat = float(payload['location']['lat'])
                    stored_lng = float(payload['location']['lng'])
                    radius = float(payload['location'].get('radius', 1.0))
                    
                    distance = calculate_distance(current_lat, current_lng, stored_lat, stored_lng)
                    if distance > radius:
                        return {'error': f'Must be within {radius}km (currently {distance:.2f}km away)'}
                except Exception as e:
                    return {'error': f'Location error: {str(e)}'}
            
            decrypted = decrypt_text(payload['text'], password)
            if not decrypted:
                return {'error': 'Incorrect password'}
            
            return {'text': decrypted}
        except Exception as e:
            return {'error': f'Payload error: {str(e)}'}
    except Exception as e:
        return {'error': f'Extraction failed: {str(e)}'}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/hide', methods=['POST'])
def api_hide():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    try:
        start_time = time.time()
        image = request.files['image']
        text = request.form.get('text', '')
        password = request.form.get('password', '')
        
        if not text or not password:
            return jsonify({'error': 'Text and password required'}), 400
        
        expiry = None
        if request.form.get('enableTimer') == 'true':
            expiry = datetime.now() + timedelta(
                minutes=int(request.form.get('minutes', 0)),
                hours=int(request.form.get('hours', 0)),
                days=int(request.form.get('days', 0))
            )
        
        location = None
        if request.form.get('enableLocation') == 'true':
            location = {
                'lat': request.form.get('lat'),
                'lng': request.form.get('lng'),
                'radius': 1.0
            }
        
        temp_path = f"temp_{image.filename}"
        image.save(temp_path)
        result = hide_data_in_image(temp_path, text, password, expiry, location)
        os.remove(temp_path)
        
        print(f"Hiding completed in {time.time()-start_time:.2f}s")
        return send_file(result, mimetype='image/png', download_name='secured_image.png')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/extract', methods=['POST'])
def api_extract():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    try:
        start_time = time.time()
        image = request.files['image']
        password = request.form.get('password', '')
        
        if not password:
            return jsonify({'error': 'Password required'}), 400
        
        temp_path = f"temp_{image.filename}"
        image.save(temp_path)
        result = extract_data_from_image(temp_path, password)
        os.remove(temp_path)
        
        print(f"Extraction completed in {time.time()-start_time:.2f}s")
        if 'error' in result:
            return jsonify({'error': result['error']}), 400
        
        return jsonify({'text': result['text']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
