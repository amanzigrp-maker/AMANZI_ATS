import { Navigate, Outlet } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

interface JwtPayload {
  id: number;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

const isAuthorized = () => {
  const token = localStorage.getItem('accessToken');
  if (!token) return false;

  try {
    const decoded = jwtDecode<JwtPayload>(token);
    const role = decoded.role?.toLowerCase();
    console.log('[AdminRoute] role=', role);

    return role === "admin" || role === "lead";
  } catch (error) {
    console.error('Invalid token:', error);
    return false;
  }
};

const AdminRoute = () => {
  return isAuthorized() ? <Outlet /> : <Navigate to="/dashboard" />;
};

export default AdminRoute;
