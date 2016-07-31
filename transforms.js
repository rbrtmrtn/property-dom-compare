module.exports = {
	zoning: {
		// Truncate OPA zoning
		opa: (val) => val.replace(/:.+/, ''),
	}
}
