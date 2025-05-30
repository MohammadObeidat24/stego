from PIL import UnidentifiedImageError
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

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default-secret-key')
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024



KEY_SIZE = 32
BLOCK_SIZE = 16  



def encrypttext(text, password):
    salt = os.urandom(16)
    key = pad(password.encode(), KEY_SIZE)[:KEY_SIZE]
    cipher = AES.new(key, AES.MODE_CBC, salt)
    ciphertext = cipher.encrypt(pad(text.encode(), BLOCK_SIZE))
    return base64.b64encode(salt + ciphertext).decode()



def decrypttext(encrypted_text, password):
    try:
        data = base64.b64decode(encrypted_text)
        salt, ciphertext = data[:16], data[16:]
        key = pad(password.encode(), KEY_SIZE)[:KEY_SIZE]
        cipher = AES.new(key, AES.MODE_CBC, salt)
        clear_text = unpad(cipher.decrypt(ciphertext), BLOCK_SIZE).decode()
        return clear_text
    except Exception as e:
        print(f"Decryption error: {str(e)}")
        return None




def geo_distance_km(lat1, lon1, lat2, lon2):
  
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    d_lat = lat2 - lat1
    d_lon = lon2 - lon1
    a = math.sin(d_lat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371  
    return c * r



def hide_text_image(image_path, text, password, expiry=None, location=None):
    try:
        img = Image.open(image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        payload = {
            'text': encrypttext(text, password),
            'expiry': expiry.isoformat() if expiry else None,
            'location': location
        }
        json_payload = json.dumps(payload)
        binary_payload = ''.join(format(ord(c), '08b') for c in json_payload) + '00000000'

       
        max_capacity = img.width * img.height * 3 
        if len(binary_payload) > max_capacity:
            raise ValueError("Image is too small to hide this message. Please use a larger image or shorter text.")

        
        pix = img.load()
        width, height = img.size
        idx = 0
        
        for y in range(height):
            for x in range(width):
                if idx >= len(binary_payload):
                    break
                r, g, b = pix[x, y]
                if idx < len(binary_payload):
                    r = (r & 0xFE) | int(binary_payload[idx])
                    idx += 1
                if idx < len(binary_payload):
                    g = (g & 0xFE) | int(binary_payload[idx])
                    idx += 1
                if idx < len(binary_payload):
                    b = (b & 0xFE) | int(binary_payload[idx])
                    idx += 1
                pix[x, y] = (r, g, b)
        
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        return img_byte_arr
    except Exception as e:
        print(f"Error hiding data: {str(e)}")
        raise




def extract_hidden_image(image_path, password):
    try:
        print(f"[{datetime.now()}] Starting extraction...")
        start_time = time.time()
        
        img = Image.open(image_path)
        
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        binary_string = ''
        pix = img.load()
        width, height = img.size
        
        found_terminator = False 

        for y in range(height):
            for x in range(width):
                r, g, b = pix[x, y]
                binary_string += str(r & 1)
                binary_string += str(g & 1)
                binary_string += str(b & 1)

            
                if '00000000' in binary_string[-24:]:
                    found_terminator = True
                    break
            if found_terminator:
                break

        endmarker = binary_string.find('00000000')
        if endmarker == -1:
            return {'error': 'No hidden data found in image'}
        
        data_str = ''.join(chr(int(binary_string[i:i+8], 2)) for i in range(0, endmarker, 8))
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
                    
                    distance = geo_distance_km(current_lat, current_lng, stored_lat, stored_lng)
                    if distance > radius:
                        return {'error': f'(You are outside the permitted location)'}
                except Exception as e:
                    return {'error': f'Location error: {str(e)}'}
                    
            decrypted = decrypttext(payload['text'], password)
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
    temp_path = None
    try:
        start_time = time.time()
        image = request.files['image']
        allowed_extensions = {'.png', '.jpg', '.jpeg'}
        filename = image.filename.lower()
        if not any(filename.endswith(ext) for ext in allowed_extensions):
            return jsonify({'error': 'Only PNG and JPG images are allowed'}), 400
        text = request.form.get('text', '')
        password = request.form.get('password', '')
        
        if not text or not password:
            return jsonify({'error': 'Text and password required'}), 400
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
            
        MAX_TEXT_LENGTH = 10000
        if len(text) > MAX_TEXT_LENGTH:
            return jsonify({'error': 'Text is too long'}), 400
            
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
        try:
            Image.open(temp_path).verify()
        except UnidentifiedImageError:
            return jsonify({'error': 'Uploaded file is not a valid image'}), 400

        result = hide_text_image(temp_path, text, password, expiry, location)
        
        print(f"Hiding completed in {time.time()-start_time:.2f}s")
        return send_file(result, mimetype='image/png', download_name='secured_image.png')
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    finally:
        if temp_path and os.path.exists(temp_path): 
            os.remove(temp_path)


@app.route('/api/extract', methods=['POST'])



def api_extract():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
        
    temp_path = None
    try:
        start_time = time.time()
        image = request.files['image']
        allowed_extensions = {'.png', '.jpg', '.jpeg'}
        filename = image.filename.lower()
        if not any(filename.endswith(ext) for ext in allowed_extensions):
            return jsonify({'error': 'Only PNG and JPG images are allowed'}), 400
        password = request.form.get('password', '')
        
        if not password:
            return jsonify({'error': 'Password required'}), 400
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400

        
        temp_path = f"temp_{image.filename}"
        image.save(temp_path)
        try:
            Image.open(temp_path).verify()
        except UnidentifiedImageError:
            return jsonify({'error': 'Uploaded file is not a valid image'}), 400
        
        result = extract_hidden_image(temp_path, password)
        
        print(f"Extraction completed in {time.time()-start_time:.2f}s")
        if 'error' in result:
            return jsonify({'error': result['error']}), 400
        
        return jsonify({'text': result['text']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if temp_path and os.path.exists(temp_path): 
            os.remove(temp_path)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
