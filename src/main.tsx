import React from'react';
import{createRoot}from'react-dom/client';
import{HashRouter}from'react-router-dom';
import App,{Boundary}from'./App';
import'./styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><HashRouter><App/></HashRouter></Boundary></React.StrictMode>);
