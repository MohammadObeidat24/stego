from flask import Flask, render_template, request, jsonify, send_file
from PIL import Image
import io
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import json
import os
from datetime import datetime, timedelta

app = Flask(__name__)

# Configuration
app.config['SECRET_KEY'] = 'your-secret-key-here'
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
    data = base64.b64decode(encrypted_text)
    salt, ciphertext = data[:16], data[16:]
    key = pad(password.encode(), KEY_SIZE)[:KEY_SIZE]
    cipher = AES.new(key, AES.MODE_CBC, salt)
    try:
        decrypted = unpad(cipher.decrypt(ciphertext), BLOCK_SIZE).decode()
        return decrypted
    except:
        return None

def hide_data_in_image(image_path, text, password, expiry=None, location=None):
    img = Image.open(image_path)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Prepare data payload
    payload = {
        'text': encrypt_text(text, password),
        'expiry': expiry.isoformat() if expiry else None,
        'location': location
    }
    data_str = json.dumps(payload)
    
    # Convert to binary
    binary_data = ''.join(format(ord(c), '08b') for c in data_str)
    binary_data += '00000000'  # End marker
    
    # Hide data in LSB
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
    
    # Save to bytes
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG', quality=95)
    img_byte_arr.seek(0)
    return img_byte_arr

def extract_data_from_image(image_path, password):
    img = Image.open(image_path)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Extract binary data
    pixels = img.load()
    width, height = img.size
    binary_data = ''
    
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            binary_data += str(r & 1)
            binary_data += str(g & 1)
            binary_data += str(b & 1)
    
    # Find end marker
    end_index = binary_data.find('00000000')
    if end_index == -1:
        return {'error': 'No hidden data found'}
    
    binary_data = binary_data[:end_index]
    
    # Convert to string
    data_str = ''
    for i in range(0, len(binary_data), 8):
        byte = binary_data[i:i+8]
        data_str += chr(int(byte, 2))
    
    try:
        payload = json.loads(data_str)
        
        # Check expiry
        if payload.get('expiry'):
            expiry = datetime.fromisoformat(payload['expiry'])
            if datetime.now() > expiry:
                return {'error': 'Time restriction expired'}
        
        # Check location
        if payload.get('location'):
            # In a real app, compare with current location
            pass
        
        # Decrypt text
        decrypted = decrypt_text(payload['text'], password)
        if not decrypted:
            return {'error': 'Invalid password'}
        
        return {'text': decrypted}
    
    except Exception as e:
        return {'error': f'Data extraction failed: {str(e)}'}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/hide', methods=['POST'])
def api_hide():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image provided'}), 400
    
    try:
        image = request.files['image']
        text = request.form.get('text', '')
        password = request.form.get('password', '')
        
        if not text or not password:
            return jsonify({'success': False, 'error': 'Text and password are required'}), 400
        
        # Process restrictions
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
                'radius': 1  # 1km
            }
        
        # Save temp file
        temp_path = 'temp_' + image.filename
        image.save(temp_path)
        
        # Process image
        result = hide_data_in_image(temp_path, text, password, expiry, location)
        os.remove(temp_path)
        
        return send_file(
            result,
            mimetype='image/png',
            as_attachment=True,
            download_name='secured_image.png'
        )
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/extract', methods=['POST'])
def api_extract():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image provided'}), 400
    
    try:
        image = request.files['image']
        password = request.form.get('password', '')
        
        if not password:
            return jsonify({'success': False, 'error': 'Password is required'}), 400
        
        # Save temp file
        temp_path = 'temp_' + image.filename
        image.save(temp_path)
        
        # Process image
        result = extract_data_from_image(temp_path, password)
        os.remove(temp_path)
        
        if 'error' in result:
            return jsonify({'success': False, 'error': result['error']}), 400
        
        return jsonify({'success': True, 'text': result['text']})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
