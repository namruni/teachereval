// Authentication middleware
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login.html');
};

// Check if the user is the authorized email
const isAuthorizedEmail = (req, res, next) => {
  if (req.user && req.user.email === process.env.AUTHORIZED_EMAIL) {
    return next();
  }
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('/login.html?error=unauthorized');
  });
};

module.exports = {
  ensureAuthenticated,
  isAuthorizedEmail
};
