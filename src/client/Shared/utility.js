
//	Utility functions used throughout the application
let utility = {
	//	Function to determine if an object is empty
	objectIsEmpty: (obj) => {
		return Object.entries(obj).length === 0 && obj.constructor === Object
	},
	//	Function to safely lookup a nested property of an object
	getProp: (p, o, d) => {
		return p.reduce((xs, x) => (xs && xs[x]) ? xs[x] : d, o)
	}
}
module.exports = utility;