/**
 * Middleware to verify if the authenticated user has the 'ADMIN' role.
 * This should be used after the verifyToken middleware.
 */
export const verifyAdmin = (req, res, next) => {
    if (!req.user || req.user.role.toUpperCase() !== 'ADMIN') {
        return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }
    next();
};
