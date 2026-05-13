"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const user_service_1 = require("@/services/user.service");
// This function configures and registers the Google OAuth2.0 strategy with Passport.
const configurePassport = () => {
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
        scope: ['profile', 'email'],
    }, async (accessToken, refreshToken, profile, done) => {
        // This function is called after the user successfully authenticates with Google.
        try {
            const email = profile.emails && profile.emails[0].value;
            if (!email) {
                return done(new Error('No email found in Google profile'), undefined);
            }
            // Check if the user already exists in our database
            let user = await (0, user_service_1.findUserByEmail)(email);
            if (user) {
                // If user exists, proceed to log them in.
                return done(null, user);
            }
            else {
                // If the user does not exist, we create a new one.
                // We generate a long, random string for the password field since this user
                // will not be logging in with a password. This satisfies the database's 'not null' constraint.
                const randomPassword = Math.random().toString(36).slice(-20);
                const newUser = await (0, user_service_1.createUser)({
                    email: email,
                    password: randomPassword
                });
                return done(null, newUser);
            }
        }
        catch (error) {
            return done(error, undefined);
        }
    }));
    // These functions are used by Passport to serialize/deserialize the user object
    // to and from the session. This is important for session management.
    passport_1.default.serializeUser((user, done) => {
        done(null, user.userid);
    });
    passport_1.default.deserializeUser(async (id, done) => {
        try {
            const user = await (0, user_service_1.findUserById)(id);
            done(null, user);
        }
        catch (error) {
            done(error, null);
        }
    });
};
exports.default = configurePassport;
