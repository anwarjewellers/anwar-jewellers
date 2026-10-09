-- Customers can sign in with Google or email through Firebase Authentication.
ALTER TABLE users ADD COLUMN firebase_uid TEXT;
CREATE UNIQUE INDEX idx_users_firebase_uid ON users(firebase_uid);
