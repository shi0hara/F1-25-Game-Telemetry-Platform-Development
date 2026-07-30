/**
 * firebase.js — Firebase Client SDK Initialisation
 * ==================================================
 * Configures and exports the Firebase app instance along with
 * Firestore (database) and Firebase Auth (authentication) services.
 * 
 * These exports are imported throughout the frontend for:
 * - `db`: Reading/writing session data, user profiles, telemetry samples
 * - `auth`: User login/logout, ID token generation for API calls
 */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase project configuration — connects to the f1telementrydatabase project
const firebaseConfig = {
  apiKey: "AIzaSyAWAn5M1rtrGELUV-qI2CDPlRV5FY5IZDI",
  authDomain: "f1telementrydatabase.firebaseapp.com",
  databaseURL: "https://f1telementrydatabase-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "f1telementrydatabase",
  storageBucket: "f1telementrydatabase.firebasestorage.app",
  messagingSenderId: "917612684438",
  appId: "1:917612684438:web:2212411d7e09d16111ceb7",
  measurementId: "G-JK06DFGF8R"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);    // Firestore database instance
export const auth = getAuth(app);       // Firebase Authentication instance