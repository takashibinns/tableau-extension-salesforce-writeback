import React from 'react';
import { Button, Tabs, TextField, DropdownSelect, Checkbox, Stepper } from '@tableau/tableau-ui';
import Axios from 'axios';
import { toast } from 'react-toastify';
import './Config.css';
import util from '../Shared/Utils';
import Loading from '../Shared/Loading';

// Declare this so our linter knows that tableau is a global object
/* global tableau */

class Config extends React.Component{

  /****************************/
  /*  Define initial state  */
  /****************************/
  constructor(props) {
    super(props);
    this.state = {
      'isLoading': true,
      'settings': this.props.settings,
      'config': {},
      'dashboard': {},
      'parameters': [],
      'worksheets': [],
      'fields': {},
      'sfObjects': [],
      'sfFields': [],
      'sfAccessToken': null,
      'sfInstanceUrl': null,
      'selectedTabIndex': 0,
      'selectedSheet': null,
      'selectedObject': null,
      'selectedFieldMappings': {}
    }
    //  Bind event handlers to `this`
    this.getObjects = this.getObjects.bind(this);
    this.getObjectFields = this.getObjectFields.bind(this);
    this.setFieldMapping = this.setFieldMapping.bind(this);
    this.salesforceLogin = this.salesforceLogin.bind(this);
    this.saveThenCloseDialog = this.saveThenCloseDialog.bind(this);
    this.closeDialog = this.closeDialog.bind(this);
  }

  /**********************************************/
  /*  Run when component is 1st written to DOM  */
  /**********************************************/
  async componentDidMount(){

    //  Save a reference to this component
    let thisComponent = this;

    //  Get the web app's settings
    const config = await Axios.get('/api/config').then( res => {
      return res.data
    })

    // Function to asynchronously get all data needed for the config popup
    async function initConfig(){

      //  Look for any saved settings
      const settingsString = tableau.extensions.settings.get(config.settingsKey);
      const settings = settingsString ? JSON.parse(settingsString) : config.defaults;

      //  Are there saved credentials for salesforce?
      const hasSalesforceCredentials = util.getProp(['salesforce','username'], settings) && util.getProp(['salesforce','password'], settings)

      //  Update the reference to the dashbaord
      let dashboard = tableau.extensions.dashboardContent.dashboard;

      //  Initialize some placeholders
      let worksheets = [];
      let fieldsDict = {};
      

      //  Get a list of parameters for this dashboard
      let parameters = await dashboard.getParametersAsync().then(function(response){
        return response;
      });

      //  Create promise array to make the call for each worksheet on the dashboard
      let dataset = await Promise.all(dashboard.worksheets.map(async (worksheet) => {
        //  Define the promise for this worksheet
        let fields = await worksheet.getSummaryDataAsync().then(function(response) {
          return response.columns;
        });
        //  Return the worksheet, along w/ the fields
        return {
          'worksheet': worksheet,
          'fields': fields
        }        
      }));

      //  Organize the data returned
      dataset.forEach( (data,index) => {
        //  Is this the current selected worksheet?
        let isSelected = thisComponent.isItemSelected(data.worksheet.name, settings.tableau.worksheet, index);
        //  Save a reference to this worksheet
        worksheets.push({'value': data.worksheet.name, 'label': data.worksheet.name, 'isSelected': isSelected})
        //  Mark the selected worksheet
        if (isSelected){
          settings.tableau.worksheet = data.worksheet.name;
        }
        //  Save the fields for this worksheet
        fieldsDict[data.worksheet.name] = data.fields
      })

      //  Update the state
      thisComponent.setState({
        'isLoading': false,
        'settings': settings,
        'config': config,
        'dashboard': dashboard,
        'parameters': parameters,
        'worksheets': worksheets,
        'selectedFieldMappings': settings.salesforce.FieldMappings,
        'fields': fieldsDict,
        'selectedSheet': settings.tableau.worksheet,
        'selectedObject': settings.salesforce.ObjectName,
        'selectedTabIndex': hasSalesforceCredentials ? 1 : 0
      })

      //  See if we can get the salesforce data automatically
      if(hasSalesforceCredentials){
        //  Run the login function, which will trigger the rest of the salesforce api calls
        thisComponent.salesforceLogin();
      }
    }

    //  Initialize the popup using tableau extension api
    tableau.extensions.initializeDialogAsync().then(initConfig)
  }

  /**********************************************/
  /*  API calls to backend service              */
  /**********************************************/

  //  Helper function that logs into Salesforce, to get an access token
  async salesforceLogin(){

    //  Fetch a list of objects from Salesforce
    const options = {
      'url': '/api/salesforce/login',
      'method': 'POST',
      'data': {
        'username': this.state.settings.salesforce.username,
        'password': this.state.settings.salesforce.password
      }
    }

    //  Make the API call to login to salesforce
    const credentails = await Axios(options).then( res => {
      return res.data;
    })

    //  Validate that we got back some good credentials
    if (credentails.error) {

      //  Notify the end user
      toast.error(credentails.message);
      
    } else {

      //  Update the state
      this.setState({
        'sfAccessToken': credentails.data.access_token,
        'sfInstanceUrl': credentails.data.instance_url,
        'selectedTabIndex': 1
      },() => {
        //  Wait for the state to finish updating, then trigger salesforce api calls
        this.getObjects();
      })
    }
  }

  //  Get a list of objects from salesforce
  async getObjects(){

    //  Save a reference to this
    let thisComponent = this;

    //  Make sure we've got an access_token before running
    const access_token = this.state.sfAccessToken;
    const instance_url = this.state.sfInstanceUrl;
    if (access_token && instance_url) {

      //  show the loading dialog
      this.setState({'isLoading':true})

      //  Get a referene to the existing settings
      let mySettings =  {...this.state.settings};

      //  Fetch a list of objects from Salesforce
      const options = {
        'url': '/api/salesforce/objects',
        'method': 'GET',
        'headers': {
          'access_token': access_token,
          'instance_url': instance_url
        }
      }
      const sfObjectsList = await Axios(options).then( res => {
        return res.data.data.sobjects.filter( (myObject) => {
          //  Only return objects, where we can create records (permission-based)
          return myObject.createable;
        }).sort( (a,b) => {
          //  Sort alphabetically on the label
          let comparison = 0;
          if (a.label > b.label) {
            comparison = 1;
          } else if (a.label < b.label) {
            comparison = -1;
          }
          return comparison;
        })
      })

      //  Loop through each object, and save it
      let sfObjects = [];
      sfObjectsList.forEach( (obj,index) => {
        //  Is this the current selected object?
        let isSelected = thisComponent.isItemSelected(obj.name, mySettings.salesforce.ObjectName, index);
        //  Save a reference to this object
        sfObjects.push({'value':obj.name, 'label': obj.label, 'isSelected': isSelected, 'isCustom': obj.custom})
        if (isSelected){
          mySettings.salesforce.ObjectName = obj.name;
        }
      })

      //  Update the state
      this.setState({
        'sfObjects': sfObjects,
        'settings': mySettings
      },() => {
        //  Fetch the list of fields for the selected object
        thisComponent.getObjectFields(mySettings.salesforce.ObjectName);
      })
    }
  }

  //  Get list of fields for the selected object
  async getObjectFields(objectName) {
    
    //  Make sure we've got an access_token before running
    const access_token = this.state.sfAccessToken;
    const instance_url = this.state.sfInstanceUrl;
    if (access_token && instance_url) {

      //  Define the axios options
      const options = {
        'url': `/api/salesforce/describe?object=${objectName}`,
        'method':'GET',
        'headers': {
          'access_token': access_token,
          'instance_url': instance_url
        }
      }
      
      //  Execute API call
      let fields = await Axios(options).then( res => {
        return res.data.data.fields.filter( (field) => {
          return field.createable;
        })
      });

      //  Parse the raw response from salesforce
      let sfFields = [];
      fields.forEach( (field)=> {
        //  Make sure we can write to this field
        if (field.createable) {
          sfFields.push({
            'value': field.name,
            'label': field.label,
            'isCustom': field.custom,
            'datatype': field.type,
            'picklistValues': field.picklistValues
          })
        }
      })
      
      //  Save the field list to the component state
      this.setState({
        'sfFields': sfFields,
        'isLoading': false
      })
    }
  }

  /**********************************************/
  /*  Helper Functions                          */
  /**********************************************/ 

  //  Update field mapping
  setFieldMapping(sfField, tableauFieldName){
    //  Get a reference to the tableau field
    const tableauField = this.state.fields[this.state.selectedSheet].filter( (tf) => {
      return tf.fieldName === tableauFieldName;
    })[0]
    //  Get a reference to the existing mappings
    let mappings = this.state.selectedFieldMappings;
    //  Add/Update this field with the new mapping
    mappings[sfField.value] = {
      'salesforce': sfField,
      'tableau': {
        'fieldName': tableauField.fieldName,
        'dataType': tableauField.dataType,
        'index': tableauField.index
      }
    }
    //  Update the state
    this.setState({selectedFieldMappings: mappings})
  }

  // Background helper that checks to see if the current item should be marked as selected
  isItemSelected(item, setting, index) {
    //  Make sure something is selected as a setting
    if (setting) {
      //  Return true, if the item matches the setting
      return (item === setting);
    } else {
      //  Return true, if there is no setting but this is the first item in the list
      return (index === 0);
    }
  }

  /**********************************************/
  /*  Event Handlers - Buttons                  */
  /**********************************************/  

  //  Function to save and then close the popup dialog
  saveThenCloseDialog () {

    //  Save a reference to this component
    let thisComponent = this;

    //  Make sure to piece together the settings
    const newSettings = {
      'salesforce': {
        'FieldMappings': this.state.selectedFieldMappings,
        'ObjectName': this.state.selectedObject,
        'username': util.getProp(['salesforce','username'],this.state.settings,''),
        'password': util.getProp(['salesforce','password'],this.state.settings,'')
      },
      'tableau': {
        'worksheet': this.state.selectedSheet
      }
    }

    //  Persist the changes made to settings
    tableau.extensions.settings.set(thisComponent.state.config.settingsKey, JSON.stringify(newSettings));
    tableau.extensions.settings.saveAsync().then((newSavedSettings) => {
      thisComponent.closeDialog()
    });
  }

  //  Function to close the popup without saving
  closeDialog() {
    //  Trigger the popup to close
    tableau.extensions.ui.closeDialog();
  }

  /**********************************************/
  /*  Render the output of this component (HTML)*/
  /**********************************************/ 

  /*  HTML Output   */
  render() {

    let thisComponent = this;

    //  Look for any existing salesforce credentials
    let sfUsername = util.getProp(['salesforce','username'], this.state.settings,'');
    let sfPassword = util.getProp(['salesforce','password'], this.state.settings,'')

    //  Create a title bar
    const title = <div className="tableau-titlebar">
                    <span className="tableau-titlebar-label">Configure Extension</span>
                    <span className="tableau-titlebar-close-button" onClick={this.closeDialog}>x</span>
                  </div>

    //  Define what tabs to display in the config popup
    const tabs = [ 
      { 
        content: 'Login', 
      }, { 
        content: 'Data' 
      }, { 
        content: 'Mapping' 
      } 
    ];

    //  Convert the list of tableau fields into an object we can render
    let tableauFields = [{ 'value': null, 'label': 'Skip', 'isSelected': false}]
    const worksheetFields = this.state.fields[this.state.selectedSheet] ? this.state.fields[this.state.selectedSheet] : [];
    worksheetFields.forEach((field, index) => {
      //const isSelected = thisComponent.isItemSelected(field.fieldName, thisComponent.state.selectedFieldMappings[field.fieldName], index+1);;
      tableauFields.push({ 'value': field.fieldName, 'label': field.fieldName, 'isSelected': false})
    })

    let availableFields = {};
    this.state.sfFields.forEach( (field) => {
      //  Create a copy of the available tableau fields
      let tFields = JSON.parse(JSON.stringify(tableauFields));
      //  Look for an existing selection
      const existingSelection = this.state.selectedFieldMappings[field.value];
      if (existingSelection) {
        //  Get the selected tableau field for this salesforce field
        const selectedTField = existingSelection.tableau.fieldName;
        //  Loop through the tableau field options, and mark one as selected
        tFields.forEach( (tField) => {
          if(tField.value === selectedTField){
            tField.isSelected = true;
          }
        })
      }
      //  Save this copy, specifically for this salesforce field
      availableFields[field.value] = tFields;
    })

    //  Function to create dropdown menu options, based on objects with the following format:
    //  obj = { value: 'selection value', isSelected: true/false, label: 'text to display'}
    const makeOption = (item, index) => <option key={index} value={item.value} selected={item.isSelected}>{item.label}</option>;

    const makeFieldOption = (field, index) => 
      <div className="tableau-section-group" key={index}>
        <span className="tableau-section-label">{field.label}:</span>
        <DropdownSelect  kind='line'
          onChange={ e => { this.setFieldMapping(field, e.target.value) }} >
          { 
            availableFields[field.value].map(makeOption)
          }
        </DropdownSelect>
      </div>
    
    const updateSfCredentials = (prop,value) => {
      //  Get the existing settings object
      let settings = {...thisComponent.state.settings};
      //  Set this property
      settings.salesforce[prop] = value;
      //  Update the state
      thisComponent.setState({'settings':settings});
    }
    //  Define the login form
    const tab1 =  <div>
                    <div className="tableau-section-title">Salesforce Credentials</div>
                    <div className="tableau-section-group">
                      <span className="tableau-section-label">Username:</span>
                      <TextField kind="label" 
                        defaultValue={sfUsername} 
                        onChange={ e => {updateSfCredentials('username',e.target.value);}} />
                    </div>
                    <br />
                    <div className="tableau-section-group">
                      <span className="tableau-section-label">Password:</span>
                      <TextField kind="label" 
                        defaultValue={sfPassword}
                        onChange={ e => {updateSfCredentials('password',e.target.value);}} />
                    </div>
                    <br />
                    <Button kind="primary" key="login" onClick={ thisComponent.salesforceLogin }>Login</Button>
                  </div>;

    //  Define the data selection page
    const tab2 =  <div>
                    <div className="tableau-section-title">Where do we get the data?</div>
                    <div className="tableau-section-group">
                      <span className="tableau-section-label">Worksheet:</span>
                      <DropdownSelect  kind='line'
                        onChange={ e => { this.setState({'selectedSheet': e.target.value}) }} >
                        { this.state.worksheets.map(makeOption) }
                      </DropdownSelect>
                    </div>
                    <div className="tableau-section-title">What Salesforce Object do we write back to?</div>
                      <div className="tableau-section-group">
                      <span className="tableau-section-label">SF Object:</span>
                      <DropdownSelect  kind='line'
                        onChange={ e => { 
                          this.setState({'selectedObject': e.target.value});
                          this.getObjectFields(e.target.value);
                        }} >
                        { this.state.sfObjects.map(makeOption) }
                      </DropdownSelect>
                    </div>
                  </div>;

    //  Define the parameter selection page
    const tab3 = <div>
                    <div className="tableau-section-title">Field Mapping</div>
                    { this.state.sfFields.map( (field,index) => { return makeFieldOption(field) }) }
                 </div>;
    
    //  Pick which HTML to render, based on the selected tab
    const content = {
      0: tab1,
      1: tab2,
      2: tab3
    }

    //  Create a footer with the save button
    const footer = <div className="tableau-footer">
                    <Button kind="outline" key="cancelButton" onClick={this.closeDialog}>Cancel</Button>
                    <Button kind="primary" key="saveButton" onClick={this.saveThenCloseDialog}>Save</Button>
                  </div>

    const main = () => {
      if(this.state.isLoading){
        return <Loading msg="Loading"></Loading>
      } else {
        return <Tabs tabs={tabs} selectedTabIndex={this.state.selectedTabIndex}
                  onTabChange={(index) => { this.setState({'selectedTabIndex': index});}}>
              { content[this.state.selectedTabIndex] }
            </Tabs>
      }
    }
    //  Return the HTML to render
    return (
      <div className="container">
        { title }
        { main() }
        { footer }
      </div>
    );
  }
}

export default Config;