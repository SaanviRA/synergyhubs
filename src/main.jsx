import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@googleworkspace/drive-picker-element'
import App from './App.jsx'

// Global Fetch Interceptor to attach Auth token automatically
const { fetch: originalFetch } = window;
window.fetch = async (url, options = {}) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
  }
  return originalFetch(url, options);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
