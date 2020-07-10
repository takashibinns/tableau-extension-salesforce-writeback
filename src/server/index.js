
//	Required dependencies
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const querystring = require('querystring');
const sleep = require('util').promisify(setTimeout);
const createCsvStringifier = require('csv-writer').createArrayCsvStringifier;
const log = require('simple-node-logger').createSimpleLogger();

//	Load the config file
const extensionConfig = require('./config.js');

//	Define the express app
const app = express();
app.use(express.static('dist'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/****************************************************/
/*	Private methods: Authentication to salesforce 	*/
/****************************************************/

/*	Define the local variables 	*/
const writeback = {
	'timeout': 60 * 1000,
	'pause': 3 * 1000,
	'recordDelimiter': '\n',
	'states': {
		'finished': 'JobComplete',
		'dataUploaded': 'UploadComplete',
		'running': 'open'
	}
};

//	Function to generate the same template for each response
function buildResponse(message, isError, details) {

	let response = {
		'message': message
	}
	if (isError) {
		response.error = true;
		log.error(message)
	}
	if (details) {
		response.data = details
	}
	return response
}

/****************************************************/
/*	Private methods: Salesforce User API Calls 		*/
/****************************************************/

//	Get the profile(s) of the current user
function getProfile(credentials,username){

	//	Define the SOQL query to execute
	const soql = `SELECT Profile.Name from Profile where Profile.Id in (SELECT User.ProfileId FROM User where User.username='${username}')`;

	//	Create the URL for the API call
	const url = `${credentials.instance_url}/services/data/v${extensionConfig.public.salesforceApiVersion}/query/?q=${soql}`;

	//	Define the options
	const options = {
		'method':'GET',
		'url': url,
		'headers': {
			'Authorization': `Bearer ${credentials.access_token}`
		}
	}

	//	Execute the API call
	return axios(options).then((response) => {
		const profile = response.data.records[0].Name;
		const message = `${username} has a profile = ${profile}`;
		log.info(message);
		return profile;
	}).catch((error)=>{
		const message = `Could not find a profile for ${username}`;
		log.error(message);
		return null;
	})
}

/****************************************************/
/*	Private methods: Salesforce Writeback API calls */
/****************************************************/

//	Salesforce - Create the upload job
function createJob(credentials, objectName) {

	log.info('Creating a job to upload data');

	//	Use simple api call (lists available rest resources) for testing
	const url = `${credentials.instance_url}/services/data/v${extensionConfig.public.salesforceApiVersion}/jobs/ingest/`;

		//	Define the payload to send
	const payload = {
		'object': objectName,
		'contentType': 'CSV',
		'operation': 'insert',
		'lineEnding': 'LF'
	};

	//	Define the api call's configuration
	const options = {
		'method': 'POST',
		'url': url,
		'headers': {
			'Content-Type': 'application/json; charset=UTF-8',
			'Accept': 'application/json',
			'Authorization': `Bearer ${credentials.access_token}`,
		},
		'data': payload
	};

	//	Make the api call to tableau server
	return axios(options).then((response) => {
		log.info('Job created');
		return {
			'success': true,
			'jobId': response.data.id,
			'details': ''
		};
	}).catch((error) => {
		log.error('Job creation failed');
		return {
			'success': false,
			'jobId': null,
			'details': error
		};
	});
}

//	Salesforce - upload the data as CSV
function uploadData(credentials, jobId, data) {

	log.info('Uploading the data in CSV format');

	//	Use simple api call (lists available rest resources) for testing
	const url = `${credentials.instance_url}/services/data/v${extensionConfig.public.salesforceApiVersion}/jobs/ingest/${jobId}/batches`;

	//	Define the api call's configuration
	const options = {
		'method': 'PUT',
		'url': url,
		'headers': {
			'Content-Type': 'text/csv',
			'Accept': 'application/json',
			'Authorization': `Bearer ${credentials.access_token}`,
		},
		'data': data
	};

	//	Make the api call to tableau server
	return axios(options).then((response) => {
		log.info('Data uploaded');
		return {
			'success': true,
			'jobId': response.data.id,
			'details': ''
		};
	}).catch((error) => {
		log.error('Data upload failed');
		return {
			'success': false,
			'jobId': null,
			'details': error
		};
	});
}

//	Salesforce - close the job
function closeJob(credentials, jobId) {

	log.info(`Close job ${jobId} (data upload complete)`);

	//	Use simple api call (lists available rest resources) for testing
	const url = `${credentials.instance_url}/services/data/v${extensionConfig.public.salesforceApiVersion}/jobs/ingest/${jobId}/`;

	//	Define the api call's configuration
	const options = {
		'method': 'PATCH',
		'url': url,
		'headers': {
			'Content-Type': 'application/json; charset=UTF-8',
			'Accept': 'application/json',
			'Authorization': `Bearer ${credentials.access_token}`,
		},
		'data': {
			'state': writeback.states.dataUploaded
		}
	};

	//	Make the api call to tableau server
	return axios(options).then((response) => {
		log.info(`Job ${jobId} closed`);
		return {
			'success': true,
			'jobId': jobId,
			'details': ''
		};
	}).catch((error) => {
		log.error(`Error: Job ${jobId} closing failed`);
		return {
			'success': false,
			'jobId': jobId,
			'details': error
		};
	});
}

//	Salesforce - get the status of a job
function jobStatus(credentials, jobId) {

	log.info(`Waiting for job ${jobId} to complete...`);

	//	Use simple api call (lists available rest resources) for testing
	const url = `${credentials.instance_url}/services/data/v${extensionConfig.public.salesforceApiVersion}/jobs/ingest/${jobId}/`;

	//	Define the api call's configuration
	const options = {
		'method': 'GET',
		'url': url,
		'headers': {
			'Content-Type': 'application/json; charset=UTF-8',
			'Accept': 'application/json',
			'Authorization': `Bearer ${credentials.access_token}`,
		}
	};

	//	Make the api call to tableau server
	return axios(options).then((response) => {
		log.info(`Job ${jobId} closed`);
		return response.data;
	}).catch((error) => {
		log.error(`Failed to close job ${jobId}`);
		return {
			'success': false,
			'jobId': jobId,
			'details': error
		};
	});
}

/****************************************************/
/*	Public methods: Salesforce API calls  		  	*/
/****************************************************/

//	API endpoint for logging in with a username & password
// 	https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/quickstart_oauth.htm
app.post('/api/salesforce/login', async (req, res) => {

	//	Start with extracting the payload of the request
	const data = req.body ? req.body : {};

	//	Check to make sure a username & password were given
	if (!data.username || !data.password){
		res.send(buildResponse('Error: username & password required', true));
		return null;
	}

	//	Define the login payload
	const payload = {
		'grant_type': 'password',
		'username': data.username,
		'password': data.password,
		'client_id': extensionConfig.private.consumerKey,
		'client_secret': extensionConfig.private.consumerSecret
	};

	//	Define the api call's configuration
	const options = {
		'method': 'POST',
		'url': extensionConfig.public.salesforceLoginUri,
		'headers': {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		'data': querystring.stringify(payload)
	};

	//	Make the API call to Salesforce
	log.info('Request access token for ' + data.username);
	let credentials = await axios(options).then((response) => {
		log.info('Received access token from Salesforce');
		return response.data
	}).catch((error) => {
		return buildResponse('Credentials were denied by Salesforce', true, {'error': error.message});
	});

	//	return the response
	if(credentials.access_token){

		//	Make sure the user belongs to an acceptable profile
		const userProfile = await getProfile(credentials,data.username);

		//	Check to see if this user's profile is in the list of profiles that are authenticated to the connected app
		const appProfiles = extensionConfig.private.profiles.split(',');
		const isValid = appProfiles.indexOf(userProfile)>=0;		
		if (isValid) {
			//	User belongs to a valid profile
			res.send(buildResponse('Salesforce credentials accepted',false, credentials));
		} else {
			//	User is valid, but their profile does not have access to the connected app
			res.send(buildResponse('User does not belong to a profile, which can talk to the connected app', true, {}));
		}
	} else {
		res.send(credentials)
	}
})

//	API endpoint for getting a list of salesforce objects
//	https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_describeGlobal.htm
app.get('/api/salesforce/objects', async (req, res) => {
	
	//	Get the authentication details
	//const login = await salesforceInit();
	const credentials = {
		'access_token': req.header('access_token'),
		'instance_url': req.header('instance_url')
	}

	if (credentials.access_token && credentials.instance_url) {

		//	Use simple api call (lists available rest resources) for testing
		const url = `${credentials.instance_url}/services/data/v${extensionConfig.public.salesforceApiVersion}/sobjects/`;

		//	Define the api call's configuration
		const options = {
			'method': 'GET',
			'url': url,
			'headers': {
				'Authorization': `Bearer ${credentials.access_token}`,
			}
		};

		//	Make the api call to tableau server
		return axios(options).then((response) => {
			const message = 'Returning list of available objects';
			log.info(message);
			return res.send(buildResponse(message,false, response.data))
		}).catch((error) => {
			const message = 'Salesforce denied our API call to get the list of available objects';
			log.error(message);
			return res.send(buildResponse(message,true, {'error': error.message}))
			
		});
	} else {
		log.error("Not Authorize: access_token or instance_url not provided");
		return res.send(buildResponse('Not Authorized', true, {'error': 'access_token or instance_url not provided'}))
	}
});

//	API endpoint for describing a specific salesforce object
//	https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_sobject_basic_info.htm
app.get('/api/salesforce/describe', async (req, res) => {

	//	Make sure the object was passed in, otherwise return an empty array
	if (typeof req.query.object === 'undefined') {
		const message = 'No object defined';
		log.info(message);
		res.send(buildResponse(message,false, []));
	}
	
	const credentials = {
		'access_token': req.header('access_token'),
		'instance_url': req.header('instance_url')
	}

	if (credentials.access_token && credentials.instance_url) {

		//	API endpoint for describing the fields (and other aspects) of a given object
		const url = `${credentials.instance_url}/services/data/v${extensionConfig.public.salesforceApiVersion}/sobjects/${req.query.object}/describe`;

		//	Define the api call's configuration
		const options = {
			'method': 'GET',
			'url': url,
			'headers': {
				'Authorization': `Bearer ${credentials.access_token}`,
			}
		};

		//	Make the api call to tableau server
		return axios(options).then((response) => {
			const message = `Fetched the description of object=${req.query.object}`;
			log.info(message);
			return res.send(buildResponse(message,false, response.data));
		}).catch((error) => {
			const message = `API call failed when describing ${req.query.object}`;
			log.error(message);
			return res.send(buildResponse(message,true, {'error': error.message}));
		});
	} else {
		log.error("Not Authorize: access_token or instance_url not provided");
		return res.send(buildResponse('Not Authorized', true, {'error': 'access_token or instance_url not provided'}));
	}
});

//	API endpoint for writing data back to salesforce (bulk api)
//	https://developer.salesforce.com/docs/atlas.en-us.api_bulk_v2.meta/api_bulk_v2/walkthrough_upload_data.htm
app.post('/api/salesforce/upload', async (req, res) => {

	//	Step 0: Make sure we have the auth details

	//	Get the authentication details
	const credentials = {
		'access_token': req.header('access_token'),
		'instance_url': req.header('instance_url'),
	}

	if (credentials.access_token && credentials.instance_url) {
	
		//	Step 1: convert the dataset to CSV
		//	https://developer.salesforce.com/docs/atlas.en-us.api_bulk_v2.meta/api_bulk_v2/datafiles_csv_rel_field_header_row.htm

		//	Start with extracting the payload of the request
		const payload = req.body ? req.body : {};

		//	Make sure a payload was sent
		if (typeof payload === 'undefined') {
			const message = 'No data provided';
			log.error(message);
			res.send(buildResponse(message,true, {'success': false,'recordsUploaded': 0}))
		}

		//	Format data as CSV 
		const csvStringifier = createCsvStringifier({
			'header': [payload.fields],
			'alwaysQuote': false,
			'fieldDelimiter': ',',
			'recordDelimiter': writeback.recordDelimiter
		});

		//	Combine the header fields with data records
		const data = `${payload.fields}${writeback.recordDelimiter}${csvStringifier.stringifyRecords(payload.records)}`;
		log.trace(data);

		//	Step 2: Create a job via Salesforce API	
		const job = await createJob(credentials, payload.object);

		//	Step 3: Upload CSV via Salesforce API
		const upload = await uploadData(credentials, job.jobId, data);

		//	Step 4: Close the job (which triggers processing) via Salesforce API
		const close = await closeJob(credentials, job.jobId);

		//	Step 5: Wait for the job to complete
		
		//	Define some variables for our condition, and mark the start time
		let running = true;
		let status;
		const startTime = new Date();

		//	Loop while waiting for the condition to be false
		while (running) {
			
			//	Wait before trying getting the status again
			await sleep(writeback.pause);

			//	Get the latest status
			status = await jobStatus(credentials, job.jobId);

			//	Re-evaluate the condition
			log.info(`current status: ${status.state}`);

			//	Check the status of the job
			if (status.state === writeback.states.finished) {
				running = false;
			}
			//	Check for timeout
			const runTime = (new Date() - startTime);
			if (runTime >= writeback.timeout) {
				running = false;
			}
		}

		//	Step 7: Return a response
		const message = `${status.numberRecordsProcessed} records written to ${payload.object}`;
		log.info(message);
		res.send(
			buildResponse(
				message,
				false, 
				{
					'success': true,
					'recordsUploaded': status.numberRecordsProcessed,
					'details': status.state
				}
			)
		)
	} else {
		const message = "Not Authorize: access_token or instance_url not provided";
		log.error(message);
		return res.send(buildResponse(message, true, {'error': 'A valid access_token and instance_url must be provided, in order to write data to salesforce'}))
	}

});

//	API endpoint for fetching this app's configuration settings
app.get('/api/config', (req, res) => res.send(extensionConfig.public));

/****************************************************/
/*	Start the Web App  		  					  	*/
/****************************************************/

//	Start the application, and listen on a given port
app.listen(process.env.PORT || 8080, () => console.log(`Listening on port ${process.env.PORT || 8080}!`));
