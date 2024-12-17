# app.py
from flask import (
    Flask, 
    send_from_directory, 
    session, 
    redirect, 
    request, 
    url_for, 
    jsonify, 
    send_file
)
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from functools import wraps
from datetime import datetime
from io import BytesIO
from PIL import Image
import os
import json

app = Flask(__name__)
# Get web-app secret from environment variables
web_app_secret = os.environ.get('web-app')
if not web_app_secret:
    raise RuntimeError("The web-app secret is not set in environment variables")
app.secret_key = web_app_secret  # Use web-app secret for Flask session

# OAuth 2.0 client configuration
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
FOLDER_ID = '1cnK5Le4U1vUtG_PiGrqU-wxEQKL2Zjfb'

# Client configuration
CLIENT_CONFIG = {
    "web": {
        "client_id": "986319166215-mtmn4gfqvcpm2vo9tee2nnp1t0o8vgg3.apps.googleusercontent.com",
        "project_id": "food-container-439701",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_secret": web_app_secret,  # Use web-app secret for OAuth client secret
        "redirect_uris": [
            "http://localhost:8080/oauth2callback",
            "https://food-track-web-app-986319166215.australia-southeast2.run.app/oauth2callback"
        ],
        "javascript_origins": [
            "http://localhost:8000",
            "http://localhost:8080",
            "https://food-track-web-app-986319166215.australia-southeast2.run.app"
        ]
    }
}

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'credentials' not in session:
            return redirect(url_for('authorize'))
        return f(*args, **kwargs)
    return decorated_function

def extract_timestamp_from_filename(filename):
    """Extract timestamp from filename pattern optimized_food_container_[timestamp].extension"""
    try:
        return filename.split('optimized_food_container_')[1].split('.')[0]
    except:
        return None

def get_file_metadata(drive_service, image_filename):
    """Get metadata/analysis file content for an image"""
    timestamp = extract_timestamp_from_filename(image_filename)
    if not timestamp:
        return None
        
    # Try both analysis and metadata files
    for prefix in ['analysis_', 'metadata_']:
        try:
            filename = f"{prefix}{timestamp}.json"
            results = drive_service.files().list(
                q=f"name = '{filename}' and '{FOLDER_ID}' in parents",
                fields="files(id)",
                pageSize=1
            ).execute()
            
            if results['files']:
                file_id = results['files'][0]['id']
                return drive_service.files().get(fileId=file_id, alt='media').execute()
        except:
            continue
            
    return None

@app.route('/')
@login_required
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/authorize')
def authorize():
    flow = Flow.from_client_config(
        CLIENT_CONFIG,
        scopes=SCOPES,
        redirect_uri=url_for('oauth2callback', _external=True)
    )
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true'
    )
    session['state'] = state
    return redirect(authorization_url)

@app.route('/oauth2callback')
def oauth2callback():
    state = session['state']
    flow = Flow.from_client_config(
        CLIENT_CONFIG,
        scopes=SCOPES,
        state=state,
        redirect_uri=url_for('oauth2callback', _external=True)
    )
    
    authorization_response = request.url
    flow.fetch_token(authorization_response=authorization_response)
    credentials = flow.credentials
    session['credentials'] = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes
    }
    return redirect(url_for('serve_index'))

@app.route('/api/gallery-data')
@login_required
def get_gallery_data():
    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)
    
    try:
        results = drive_service.files().list(
            q=f"'{FOLDER_ID}' in parents and (mimeType contains 'image/' or mimeType contains 'application/json') and trashed = false",
            fields="files(id, name, modifiedTime, mimeType)",
            pageSize=1000,
            orderBy="modifiedTime desc",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        
        # Process and organize files by date
        dates = {}
        total_images = 0
        
        for file in results.get('files', []):
            if 'image' in file['mimeType']:
                total_images += 1
                timestamp = extract_timestamp_from_filename(file['name'])
                if not timestamp:
                    continue
                
                # Get associated metadata/analysis file
                metadata = get_file_metadata(drive_service, file['name'])
                
                if metadata:
                    date = datetime.fromtimestamp(int(timestamp)/1000).strftime('%Y-%m-%d')
                    
                    if date not in dates:
                        dates[date] = {
                            'data': [],
                            'totalCalories': 0,
                            'itemCount': 0
                        }
                    
                    # Process nutritional info
                    nutritional_info = metadata.get('nutritional_info', {})
                    if nutritional_info:
                        calories = float(nutritional_info.get('calories (kcal)', 0))
                        dates[date]['totalCalories'] += calories
                        dates[date]['itemCount'] += 1
                    
                    # Add item data
                    dates[date]['data'].append({
                        'id': file['id'],
                        'name': file['name'],
                        'timestamp': metadata.get('timestamp'),
                        'weightGrams': metadata.get('weight_grams'),
                        'nutritionalInfo': {
                            'totalWeightGrams': nutritional_info.get('total_weight_grams', metadata.get('weight_grams')),
                            'foodWeightGrams': nutritional_info.get('food_weight_grams', metadata.get('weight_grams')),
                            'foodIdentified': nutritional_info.get('food_identified_short', ''),
                            'calories': nutritional_info.get('calories (kcal)', 0),
                            'carbs': nutritional_info.get('carbohydrates (g)', 0),
                            'protein': nutritional_info.get('protein (g)', 0),
                            'fat': nutritional_info.get('fat (g)', 0)
                        } if nutritional_info else None
                    })
        
        # Round total calories for each date
        for date_data in dates.values():
            date_data['totalCalories'] = round(date_data['totalCalories'])
        
        return jsonify({
            'dates': dates,
            'totalImages': total_images
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/thumbnail/<file_id>')
@login_required
def get_thumbnail(file_id):
    credentials = Credentials(**session['credentials'])
    drive_service = build('drive', 'v3', credentials=credentials)
    
    try:
        # Get the image content
        response = drive_service.files().get_media(fileId=file_id).execute()
        
        # Create thumbnail if needed
        img = Image.open(BytesIO(response))
        img.thumbnail((1000, 1000))  # Adjust size as needed
        
        # Save thumbnail to buffer
        buffer = BytesIO()
        img.save(buffer, format='JPEG')
        buffer.seek(0)
        
        return send_file(
            buffer,
            mimetype='image/jpeg',
            as_attachment=False,
            download_name=f'thumb_{file_id}.jpg'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/<path:path>')
@login_required
def serve_files(path):
    return send_from_directory('.', path)

@app.errorhandler(Exception)
def handle_error(error):
    print(f"Error: {error}")
    return jsonify({'error': str(error)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)