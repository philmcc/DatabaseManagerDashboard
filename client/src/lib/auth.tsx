import { apiRequest } from './api';

const fetchUser = async () => {
  try {
    const data = await apiRequest('/user').catch(err => {
      if (err.message.includes('401')) {
        // Not authenticated
        return { isLoggedIn: false };
      }
      throw err;
    });
    
    if (data.isLoggedIn) {
      setUser(data);
    } else {
      setUser(null);
    }
    setIsLoading(false);
  } catch (error) {
    console.error('Error fetching user:', error);
    setUser(null);
    setIsLoading(false);
  }
}; 