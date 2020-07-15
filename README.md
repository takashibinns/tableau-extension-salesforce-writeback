# Salesforce Writeback Extension
This project is a Tableau Desktop Extension, which allows users to take data from their workbook and write it as records to an object within Salesforce.  This web app acts as a middle-man between salesforce and your Tableau dashboard.  You specify a worksheet from your dashboard that contains the data you want to write, and when you click the Save button the app will grab the data from your worksheet and upload it to salesforce.  You can decide what object gets written to, as well as what fields you want to write to.  This process leverage the Salesforce REST API to login (with your credentials) and the Bulk API to upload the data.  If you're interested in seeing the code specific to writeback, it's found in */src/server/index.js*

![Example Dashboard Image](/screenshots/dashboard.png)

## Architecture Diagram
![Architecture](/screenshots/Architecture.png)

## Prerequisites: Connected App in Salesforce
In order for this app to talk to salesforce, we need to authenticate through a connected app.  In order to create this, start by logging into Salesforce as an admin and goto the **Setup page**.  From here, navigate to the **App Manager** and click the button for creating a **New Connected App**.

![App Manager page](/screenshots/connectedApp1.png)

On the next page, there are some required fields to enter like the *app name*, *api name*, and *contact email* but make sure to check the box for **Enable OAuth Settings**.  You will need a callback URL, which can be any website in this case, and make sure to add **Access and Manage your data (api)** under the **Selected OAuth Scopes**.  This is needed, in order for the app to be able to use the Salesforce REST API.  The other settings can be left as-is, so just scroll to the bottom and click save.

![Create new Connected App](/screenshots/connectedApp2.png)

This next page should show your connected app's **Consumer Secret** and **Consumer Key**.  Copy these values, as you will need them in order to connect later. 

![View Connected App](/screenshots/connectedApp3.png)

Next click on the **Manage button**, and then on the next page click on the **Edit Policy** button.  From here, you should set the *OAuth Policy* -> *Permitted Users* dropdown to *Admin approved users are pre-authorized* and click save.  

![Edit Connected App Policies](/screenshots/connectedApp4.png)

Now you should see a button to manage profiles who have access to this connected app.  Click the **Manage Profiles** button, and you should see a list of all user profiles within your salesforce org.  Check the boxes next to the user profiles who you want to be authorized to writeback to Salesforce.  This part is defining what users are allowed to authenticate using the connected app.  You should also make a note of the profiles you selected, as this is also needed in order to configure the extension.

![Manage Profiles](/screenshots/connectedApp5.png)

## Extension Setup
Now that you have a connected app in salesforce, we can configure the app that hosts the extension.  After you download the extension code from this repository, we need to set [some environment variables](https://www.twilio.com/blog/2017/01/how-to-set-environment-variables.html).  You can do this in a few ways, but the easiest is to create a new file named **.env** within the root project directory that looks something like this:

```
#	Server Configuration
PORT=8080
#	Salesforce Credentials
CONSUMERKEY=<consumer-key-from-connected-app>
CONSUMERSECRET=<consumer-secret-from-connected-app>
PROFILES="<SalesforceProfile1>,<SalesforceProfile2>,<etc>"
```

You will need to replace the part in between <> with the info from your connected app.  Now you should have everything you need to get started so use the following [yarn](https://classic.yarnpkg.com/en/docs/getting-started) commands to get started.

```
yarn install  # This will install all dependencies for the project

yarn dev      # This will start up the web app in development mode

yarn start    # This will start up the web app in production mode
```

## Extension Usage
Once the web app is up and running and salesforce is configured (see below), you can download the [.trex](https://raw.githubusercontent.com/takashibinns/tableau-extension-salesforce-writeback/master/tableau_files/SF-Writeback-Extension.trex) file to get started.  You may need to edit the .trex file if you've deployed your extension web app to somewhere other than localhost.  Within Tableau Desktop, drag an extension object onto your dashboard and select your .trex file.  It should load as a blue save button, but we need to configure it before we can use it.  Click on the extension's options menu and select the **Configure** button.  

![Configure the extension1](/screenshots/extension-config.png)

This should give you a popup, where you can login to salesforce.  Enter your credentials and click the **Login** button.  Remember that the user account you specify here must belong to one of the profiles we specified when creating our connected app.

![Configure the extension2](/screenshots/config-login.png)

Once you login successfully, you will get moved to the Data tab.  Here you can select which worksheet contains the data you want to upload (this sheet must exist on the dashboard).  You can also select which salesforce object you want to write back to.  This list of objects is fetched via the Salesforce API, based on the username/password you specified in the config.  It's also filtered to only show objects that are marked as **createable** via the Salesforce API.

![Configure the extension2](/screenshots/config-data.png)

On the last tab, you need to specify the mapping between fields from your Tableau worksheet to fields within the salesforce object.  You should see a list of all write-able (createable) fields for the object you selected and a dropdown menu for each of them (containing all fields from your Tableau worksheet).  Select the appropriate Tableau field for each salesforce field, or use the *Skip* option to not write data to that field.  Once you are finished, click the **Save** button to save your settings.  

![Configure the extension3](/screenshots/config-mapping.png)

Now when you click on the save button from your dashboard, it should upload the data to your salesforce object and return a toast notification when the job is finished.

![finished screenshot](/screenshots/toast-success.png)

## Known Limitations
* This extension does not yet do any data type casting, meaning if your tableau field is a date but the salesforce object is a number you may run into a problem writing to that field.
