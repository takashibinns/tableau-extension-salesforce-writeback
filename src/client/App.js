
//  Import dependencies used throughout the application
import React, { Component } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  BrowserRouter as Router,
  useLocation
} from 'react-router-dom';
import Extension from './Extension/Extension';
import Config from './Config/Config';

function Navigator() {

  //  Get the location object
  const location = useLocation();
  
  //  Decide whether to show the extension or config popup
  const output = () => {
    if (location.hash === '#config') {
      return <Config/>;
    }
    return <Extension/>;
  };
  return (
    <div>
      { output() }
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <ToastContainer position="top-center" autoClose={2000} hideProgressBar newestOnTop
          closeOnClick rtl={false} pauseOnFocusLoss draggable={false} pauseOnHover
        />
      <Navigator />
    </Router>
  );
}