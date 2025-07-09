import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, Clock, Star } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/card';
import { Button } from '../components/button';
import './SupportFinder.css';

const SupportFinder = () => {
  const [location, setLocation] = useState('');
  const [resourceType, setResourceType] = useState('all');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const resourceTypes = [
    { id: 'all', label: 'All Services' },
    { id: 'healthcare', label: 'Healthcare Providers' },
    { id: 'education', label: 'Educational Support' },
    { id: 'community', label: 'Support Groups' },
    { id: 'therapy', label: 'Speech & Occupational Therapy' }
  ];

  const handleSearch = async () => {
    if (!location) return;
    
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:5003/api/search-resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors', // Explicitly set CORS mode
        body: JSON.stringify({ location, resourceType })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Error searching resources:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const ResourceCard = ({ resource }) => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center">
              <h3 className="text-lg font-semibold">{resource.name}</h3>
              {resource.verified && (
                <span className="verified-badge">Verified Provider</span>
              )}
            </div>
            <div className="resource-detail">
              <MapPin className="icon" />
              <span>{resource.address}</span>
            </div>
            <div className="resource-detail">
              <Phone className="icon" />
              <span>{resource.phone}</span>
            </div>
            <div className="resource-detail">
              <Clock className="icon" />
              <span>{resource.hours}</span>
            </div>
          </div>
          <div className="rating">
            <Star className="star-icon" />
            <span className="rating-score">{resource.rating}</span>
            <span className="distance">{resource.distance}</span>
          </div>
        </div>
        <div className="services">
          {resource.services.map((service, index) => (
            <span key={index} className="service-tag">
              {service}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container">
      <Card className="support-finder-card">
        <CardHeader className="card-header">
          <h2>Find Support Near You</h2>
          <MapPin className="icon" />
        </CardHeader>
        <CardContent>
          <div className="search-container">
            <div className="search-input">
              <Search className="search-icon" />
              <input
                type="text"
                placeholder="Enter your location..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="location-input"
              />
            </div>
            <Button onClick={handleSearch} className="search-button">
              Search
            </Button>
          </div>

          <div className="filter-container">
            {resourceTypes.map(type => (
              <Button
                key={type.id}
                onClick={() => setResourceType(type.id)}
                className={`filter-button ${resourceType === type.id ? 'active' : ''}`}
              >
                {type.label}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Finding resources near you...</p>
            </div>
          ) : (
            <div className="results">
              {results.map(resource => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SupportFinder;