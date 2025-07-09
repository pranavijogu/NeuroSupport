from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from math import radians, sin, cos, sqrt, atan2
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Apply CORS with max permissiveness for development
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route('/api/search-resources', methods=['OPTIONS', 'POST'])
def search_resources():
    # Explicitly handle OPTIONS requests
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        return response

    data = request.get_json()
    location = data.get('location', '')
    resource_type = data.get('resourceType', 'all')
    
    # First, geocode the location
    geocode_url = "https://maps.gomaps.pro/maps/api/geocode/json"
    params = {
        'address': location,
        'key': os.getenv("GOOGLE_MAPS_API_KEY")
    }
    
    try:
        geocode_response = requests.get(geocode_url, params=params)
        geocode_data = geocode_response.json()
        
        if geocode_data['status'] != 'OK':
            return jsonify({'error': 'Location not found'}), 400
            
        lat = geocode_data['results'][0]['geometry']['location']['lat']
        lng = geocode_data['results'][0]['geometry']['location']['lng']
        
        # Now search for places
        places_url = "https://maps.gomaps.pro/maps/api/place/nearbysearch/json"
        
        # Define search parameters based on resource type
        search_params = {
            'healthcare': ['autism specialist', 'psychiatrist', 'psychologist', 'developmental pediatrician'],
            'education': ['dyslexia tutor', 'special education', 'learning center'],
            'community': ['autism support group', 'dyslexia support', 'parent support group'],
            'therapy': ['speech therapy', 'occupational therapy', 'ABA therapy']
        }
        
        all_results = []
        keywords = search_params.get(resource_type, [])
        if resource_type == 'all':
            keywords = [item for sublist in search_params.values() for item in sublist]
        
        for keyword in keywords:
            places_params = {
                'location': f"{lat},{lng}",
                'radius': 5000,  # 5km radius
                'keyword': keyword,
                'key': os.getenv("GOOGLE_MAPS_API_KEY")
            }
            
            places_response = requests.get(places_url, params=places_params)
            places_data = places_response.json()
            
            if places_data['status'] == 'OK':
                for place in places_data['results']:
                    # Calculate actual distance
                    place_lat = place['geometry']['location']['lat']
                    place_lng = place['geometry']['location']['lng']
                    distance = calculate_distance(lat, lng, place_lat, place_lng)
                    place['distance'] = distance
                all_results.extend(places_data['results'])
        
        # Process and deduplicate results
        processed_results = []
        seen_places = set()
        
        for place in all_results:
            if place['place_id'] not in seen_places:
                seen_places.add(place['place_id'])
                
                # Get place details for additional information
                details_url = "https://maps.gomaps.pro/maps/api/place/details/json"
                details_params = {
                    'place_id': place['place_id'],
                    'fields': 'formatted_phone_number,opening_hours,website',
                    'key': os.getenv("GOOGLE_MAPS_API_KEY")
                }
                
                details_response = requests.get(details_url, params=details_params)
                details_data = details_response.json()
                place_details = details_data.get('result', {})
                
                processed_results.append({
                    'id': place['place_id'],
                    'name': place['name'],
                    'address': place.get('vicinity', 'Address not available'),
                    'rating': place.get('rating', 'Not rated'),
                    'phone': place_details.get('formatted_phone_number', 'Contact for details'),
                    'distance': f"{place['distance']:.1f} km",
                    'hours': place_details.get('opening_hours', {}).get('weekday_text', ['Hours not available'])[0],
                    'website': place_details.get('website', ''),
                    'services': [keyword for keyword in keywords if keyword.lower() in place['name'].lower()],
                    'verified': place.get('business_status', '') == 'OPERATIONAL'
                })
        
        # Sort results by distance
        processed_results.sort(key=lambda x: float(x['distance'].split()[0]))
        
        return jsonify({'results': processed_results})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def calculate_distance(lat1, lon1, lat2, lon2):
    # Convert latitude and longitude from degrees to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    
    # Radius of Earth in kilometers (mean radius)
    R = 6371.0
    distance = R * c
    
    return distance

if __name__ == '__main__':
    # Make sure we specify host='0.0.0.0' to allow external connections
    app.run(debug=True, host='0.0.0.0', port=5003)