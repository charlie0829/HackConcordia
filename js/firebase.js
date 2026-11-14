// Shared Firebase setup. Every file imports Firebase from here, so the SDK
// version and config live in one place. (Owner: shared)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js";

export {
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js";
export {
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAEIVTEafHPn9G7AAnW04EjYFBq65-bKSI",
    authDomain: "carpool-47bf9.firebaseapp.com",
    projectId: "carpool-47bf9",
    storageBucket: "carpool-47bf9.firebasestorage.app",
    messagingSenderId: "239922567348",
    appId: "1:239922567348:web:b8428e085513fcfe2c9fe1",
    measurementId: "G-70C309H2M2"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
