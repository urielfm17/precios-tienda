const firebaseConfig = {
  apiKey: "AIzaSyA7icQgEHr370dC5x3V3QZ7gA9XOuIkTWA",
  authDomain: "tienda-precios.firebaseapp.com",
  projectId: "tienda-precios",
  storageBucket: "tienda-precios.firebasestorage.app",
  messagingSenderId: "951124770643",
  appId: "1:951124770643:web:5f60d705872ed7d7092ba6",
  measurementId: "G-DT5P80MPZQ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

db.enablePersistence().catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Offline persistence: multiple tabs open');
  }
});
