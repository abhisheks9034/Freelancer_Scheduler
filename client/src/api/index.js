import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
export const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const API = axios.create({
    baseURL: API_BASE_URL,
});

API.interceptors.request.use((req) => {
    const token = sessionStorage.getItem('token');
    if (token) req.headers.Authorization = `Bearer ${token}`;
    return req;
});

API.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            sessionStorage.clear();
            window.location.href = '/auth';
        }
        return Promise.reject(error);
    }
);

// Auth
export const registerUser = (data) => API.post('/auth/register', data);
export const loginUser = (data) => API.post('/auth/login', data);

// Availability
export const fetchAvailability = (id) => API.get(`/availability/${id}`);
export const addAvailability = (data) => API.post('/availability', data);
export const createBulkAvailability = (data) => API.post('/availability/bulk', data);
export const deleteAvailability = (id) => API.delete(`/availability/${id}`);
// Bookings
export const fetchBookings = () => API.get('/bookings');
export const fetchAllBookings = () => API.get('/bookings/all');
export const createBooking = (data) => API.post('/bookings', data);
export const requestMeeting = (data) => API.post('/bookings/request', data);
export const approveMeeting = (id) => API.patch(`/bookings/${id}/approve`);
export const declineMeeting = (id, data) => API.patch(`/bookings/${id}/decline`, data);
export const manualBooking = (data) => API.post('/bookings/manual', data);
export const cancelBooking = (id) => API.delete(`/bookings/${id}`);
export const fetchClientBookings = () => API.get('/bookings/client/my-bookings');
export const fetchStats = () => API.get('/bookings/stats');
export const fetchFinancials = () => API.get('/bookings/financials');

// Users
export const toggleAvailability = () => API.patch('/users/availability-toggle');
export const fetchMe = () => API.get('/users/me');
export const updateProfile = (data) => API.patch('/users/profile', data);
export const fetchProfile = (id) => API.get(`/users/${id}/profile`);
export const fetchMyFreelancers = () => API.get('/users/client/my-freelancers');
export const fetchDirectory = () => API.get('/users/directory');

// AI Assistant
export const chatWithAI = (data) => API.post('/ai/chat', data);

// Chat (matched pairs only)
export const fetchChatThreads = () => API.get('/chat/threads');
export const fetchThreadMessages = (counterpartId) => API.get(`/chat/threads/${counterpartId}/messages`);
export const sendThreadMessage = (counterpartId, data) => API.post(`/chat/threads/${counterpartId}/messages`, data);

// Services
export const fetchAllServices = () => API.get('/services');
export const fetchFreelancerServices = (id) => API.get(`/services/freelancer/${id}`);
export const createService = (data) => API.post('/services', data);
export const updateService = (id, data) => API.put(`/services/${id}`, data);
export const deleteService = (id) => API.delete(`/services/${id}`);

export default API;
