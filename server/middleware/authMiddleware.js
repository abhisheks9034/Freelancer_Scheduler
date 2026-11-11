const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    // 1. Get the token from the request header
    // Usually sent as "Bearer eyJhbGciOi..."
    const authHeader = req.header('Authorization'); 
    
    if (!authHeader) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        // 2. Extract the token (remove the "Bearer " part)
        const token = authHeader.split(' ')[1];

        // 3. Verify the token using your secret key from .env
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        
        // 4. Attach the user data (id, role) to the request object
        req.user = verified; 
        
        // 5. Move on to the actual route handler
        next(); 
    } catch (error) {
        res.status(401).json({ error: "Invalid or expired token. Please log in again." });
    }
};