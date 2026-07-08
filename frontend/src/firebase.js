import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

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

export const db = getFirestore(app);
export const auth = getAuth(app);