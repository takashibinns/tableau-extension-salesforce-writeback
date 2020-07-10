import React from 'react';
import Spinner from 'react-spinkit';
import './Loading.css';

function Loading(props) {
  return (
    <div className='loadingIndicator'>
      <h3>{props.msg}</h3>
      <Spinner name='three-bounce' fadeIn='none' className="configSpinner"/>
    </div>
  );
}

export default Loading;
