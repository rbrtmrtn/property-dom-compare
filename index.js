const Nightmare   = require('nightmare')
const minimist    = require('minimist')
const hooks       = require('./hooks')
const transforms  = require('./transforms')
const util        = require('./util')
const accounts    = require('./accounts')

// SET UP
// --------------------------------------------------

const args                = minimist(process.argv.slice(2))
const maxAccounts         = args.max
const shuffle             = args.shuffle
const show                = args.show

const valuationAttrNames = [
  'year',
  'market-value',
  'taxable-land',
  'taxable-improvement',
  'exempt-land',
  'exempt-improvement',
]

const outCols = [
  'account',
  'key',
  'ais',
  'opa',
  'valuation',
]
process.stdout.write(outCols.join(',') + '\n')

if (shuffle) util.shuffle(accounts)

const nightmare   = Nightmare({ show: show })

// --------------------------------------------------

// This is passed to `evaluate` and executed in the browser context.
const getValuesFromPage = (hooks, valuationAttrNames) => {
  const vals = {}

  // Get hook values
  for (let hook of hooks) {
    vals[hook] = document.querySelector('[data-hook="' + hook + '"]').textContent
  }

  // Make valuations object (year => {valuation attrs})
  const valuations = {}
  console.log(!!document.querySelector('[data-hook="valuation"]'))
  valuationRows = document.querySelector('[data-hook="valuation"]').children
  // Loop over rows (years)
  for (let valuationRow of valuationRows) {
    const valuationAttrs = {}
    const valuationCols = valuationRow.children
    const year = Number(valuationCols[0].children[1].textContent)
    // Loop over columns (attributes)
    for (let i = 1; i < valuationAttrNames.length; i ++) {
      const valuationAttrName = valuationAttrNames[i]
      let valuationAttr = valuationCols[i].children[1].textContent
      // Remove currency formatting
      valuationAttr = Number(valuationAttr.replace(/[^0-9\.]+/g,''))
      valuationAttrs[valuationAttrName] = valuationAttr
    }
    valuations[year] = valuationAttrs
  }
  vals.valuations = valuations

  return vals
}

const scrapeOpa = (account, hooks, nightmare) => {
  const url = 'http://property.phila.gov/?p=' + account
  return nightmare
          .goto(url)
          .wait(() => history.state.sa && history.state.opa)
          .wait('[data-hook="valuation"]')
          // .on('console', (type, args) => console.log(args))
          .evaluate(getValuesFromPage, hooks, valuationAttrNames)
}

const scrapeAis = (account, hooks, nightmare) => {
  const url = 'http://property-test.surge.sh/?p=' + account
  return nightmare
          .goto(url)
          .wait(() => history.state.opa && history.state.homestead)
          .wait('[data-hook="valuation"]')
          // .on('console', (type, args) => console.log(args))
          .evaluate(getValuesFromPage, hooks, valuationAttrNames)
}

const diffValues = (account, ais, opa) => {
  const diffs = []
  for (let hook of hooks) {
    let aisVal = ais[hook]
    let opaVal = opa[hook]
    // Apply transforms
    if (transforms[hook]) {
      if (transforms[hook].ais) aisVal = transforms[hook].ais(aisVal)
      if (transforms[hook].opa) opaVal = transforms[hook].opa(opaVal)
    }
    if (aisVal !== opaVal) {
      diffs.push({
        account:    account,
        ais:        aisVal,
        opa:        opaVal,
        key:        hook,
        valuation:  false,
      })
    }
  }

  // Diff valuations
  aisValuations = ais.valuations
  opaValuations = opa.valuations
  // Loop over years in OPA evaluation
  for (let year of Object.keys(opaValuations)) {
    opaValuation = opaValuations[year]
    aisValuation = aisValuations[year]
    // Loop over attributes
    for (let i = 1; i < valuationAttrNames.length; i ++) {
      // Get AIS valuation for that year
      const valuationAttrName = valuationAttrNames[i]
      const opaValuationAttr = opaValuation[valuationAttrName]
      const aisValuationAttr = aisValuation[valuationAttrName]
      if (aisValuationAttr !== opaValuationAttr) {
        diffs.push({
          account:    account,
          ais:        aisValuationAttr,
          opa:        opaValuationAttr,
          key:        valuationAttrName + '-' + year,
          valuation:  true,
        })
      }
    }
  }

  return diffs
}

const writeDiffs = (diffs) => {
  for (let diff of diffs) {
    const vals = []
    for (let outCol of outCols) {
      vals.push(diff[outCol])
    }
    const outRow = vals.join(',') + '\n'
    process.stdout.write(outRow)
  }
}

let diffs = []

const compareAccountAtIndex = (i) => {
  try {
    if (maxAccounts && i === maxAccounts) throw 'finished'

    let account = accounts[i]

    // Skip duplicates
    if (diffs[account]) compareAccountAtIndex(i + 1)

    // console.info('Comparing', account)
    
    // Get values for OPA-backed site
    scrapeOpa(account, hooks, nightmare)
      .then((opa) => {
        // Get values for AIS-backed site
        scrapeAis(account, hooks, nightmare)
          .then((ais) => {
            const accountDiffs = diffValues(account, ais, opa)
            diffs = diffs.concat(accountDiffs)
            writeDiffs(accountDiffs)

            if (i < accounts.length - 1) {
              compareAccountAtIndex(i + 1)
            }
            else throw 'finished'
          })
          .catch((error) => {
            if (error === 'finished') throw error  // hacky
            console.error('AIS failed:', error)
            compareNextAccount(i)
          })
      })
      .catch((error) => {
        console.error('OPA failed:', error)
        compareNextAccount(i)
      })
  } catch (msg) {
    if (msg === 'finished') {
      nightmare.end()
    }
    else throw msg
  }
} 
compareAccountAtIndex(0)

const compareNextAccount = (i) => compareAccountAtIndex(i + 1)
