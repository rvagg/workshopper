const argv       = require('optimist').argv
    , fs         = require('fs')
    , path       = require('path')
    , mkdirp     = require('mkdirp')
    , map        = require('map-async')
    , pygmentize = require('pygmentize-bundled')

const showMenu  = require('./menu')
    , verify    = require('./verify')
    , printText = require('./print-text')
    , repeat    = require('./term-util').repeat
    , bold      = require('./term-util').bold
    , red       = require('./term-util').red
    , green     = require('./term-util').green
    , center    = require('./term-util').center

const defaultWidth = 65

function Workshopper (options) {
  if (!(this instanceof Workshopper))
    return new Workshopper(options)

  if (typeof options != 'object')
    throw new TypeError('need to provide an options object')

  if (typeof options.name != 'string')
    throw new TypeError('need to provide a `name` String option')

  if (typeof options.title != 'string')
    throw new TypeError('need to provide a `title` String option')

  if (typeof options.appDir != 'string')
    throw new TypeError('need to provide an `appDir` String option')

  this.name    = options.name
  this.title   = options.title
  this.width   = typeof options.width == 'number' ? options.width : defaultWidth

  this.appDir  = options.appDir
  this.dataDir = path.join(
      process.env.HOME || process.env.USERPROFILE
    , '.config'
    , this.name
  )

  mkdirp.sync(this.dataDir)
}

Workshopper.prototype.init = function () {
  if (argv.h || argv.help || argv._[0] == 'help')
    return this._printUsage()

  if (argv.v || argv.version || argv._[0] == 'version')
    return console.log(this.name + '@' + require(path.join(this.appDir, 'package.json')).version)

  if (argv._[0] == 'list') {
    return this.problems().forEach(function (name) {
      console.log(name)
    })
  }

  if (argv._[0] == 'current')
    return console.log(this.getData('current'))

  if (argv._[0] == 'select' || argv._[0] == 'print') {
    return onselect.call(this, argv._.length > 1
      ? argv._.slice(1).join(' ')
      : this.getData('current')
    )
  }

  var run = argv._[0] == 'run'
  if (argv._[0] == 'verify' || run)
    return this.verify(run)

  this.printMenu()
}

Workshopper.prototype.verify = function (run) {
  var current = this.getData('current')
    , dir
    , setup

  if (!current) {
    console.error('ERROR: No active problem. Select a challenge from the menu.')
    return process.exit(1)
  }
  
  dir   = this.dirFromName(current)
  setup = require(dir + '/setup.js')(run)

  setTimeout(this.runSetup.bind(this, setup, dir, current, run), setup.wait || 1)
}

Workshopper.prototype.printMenu = function () {
  var menu = showMenu({
      name      : this.name
    , title     : this.title
    , width     : this.width
    , completed : this.getData('completed') || []
    , problems  : this.problems()
  })
  menu.on('select', onselect.bind(this))
  menu.on('exit', function () {
    console.log()
    process.exit(0)
  })
  menu.on('help', function () {
    console.log()
    return this._printUsage()
  }.bind(this))
}

Workshopper.prototype.problems = function () {
  if (!this._problems)
    this._problems = require(path.join(this.appDir, 'menu.json'))
  return this._problems
}

Workshopper.prototype.getData = function (name) {
  var file = path.resolve(this.dataDir, name + '.json')
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {}
  return null
}

Workshopper.prototype.updateData = function (name, fn) {
  var json = {}
    , file

  try {
    json = this.getData(name)
  } catch (e) {}

  file = path.resolve(this.dataDir, name + '.json')
  fs.writeFileSync(file, JSON.stringify(fn(json)))
}

Workshopper.prototype.dirFromName = function (name) {
  return path.join(
      this.appDir
    , 'problems'
    , name.toLowerCase()
        .replace(/\s/g, '_')
        .replace(/[^a-z_]/gi, '')
  )
}
Workshopper.prototype.runSetup = function (setup, dir, current, run) {
  var a   = runArgs(setup)
    , b   = [ dir + '/solution.js' ].concat(setup.args || [])
    , v   = verify(a, b, {
          a      : setup.a
        , b      : setup.b
        , long   : setup.long
        , run    : run
        , custom : setup.verify
      })

  v.on('pass', onpass.bind(this, setup, dir, current))
  v.on('fail', onfail.bind(this, setup, dir, current))

  if (run && setup.close)
    v.on('end', setup.close)

  if (setup.stdin) {
    setup.stdin.pipe(v)
    setup.stdin.resume()
  }
  
  if (setup.a)
    setup.a.resume()
  if (setup.b)
    setup.b.resume()
}

function runArgs (setup) {
  var exec

  if (setup.modUseTrack) {
    exec = [
        require.resolve('./exec-wrapper')
      , require.resolve('./module-use-tracker')
      , setup.modUseTrack
      , argv._[1]
    ]
  } else {
    exec = [ argv._[1] ]
  }

  return exec.concat(setup.args || [])
}

Workshopper.prototype._printUsage = function () {
  printText(this.name, path.join(__dirname, './usage.txt'))
}

function onpass (setup, dir, current) {
  console.log(bold(green('# PASS')))
  console.log('\nYour solution to ' + current + ' passed!')
  console.log('\nHere\'s what the official solution is if you want to compare notes:\n')

  var solutions = fs.readdirSync(dir).filter(function (file) {
        return (/^solution.*\.js/).test(file)
      }).map(function (file) {
        return {
            name: file
          , content: fs.readFileSync(path.join(dir, file), 'utf8')
              .toString()
              .replace(/^/gm, '  ')
        }
      })
    , completed
    , remaining

  map(
      solutions
    , function (file, i, callback) {
        pygmentize(
            { lang: 'js', format: 'terminal256' }
          , file.content
          , function (err, content) {
              if (!err)
                file.content = content.toString()
              callback(null, file)
            }
        )
      }
    , function (err, solutions) {
        if (err)
          throw err

        solutions.forEach(function (file, i) {
          console.log(repeat('-', this.width) + '\n')
          if (solutions.length > 1)
            console.log(bold(file.name) + ':\n')
          console.log(file.content)
          if (i == solutions.length - 1)
            console.log(repeat('-', this.width) + '\n')
        }.bind(this))
        
        this.updateData('completed', function (xs) {
          if (!xs) xs = []
          var ix = xs.indexOf(current)
          return ix >= 0 ? xs : xs.concat(current)
        })
        
        completed = this.getData('completed') || []
        
        remaining = this.problems().length - completed.length
        if (remaining === 0) {
          console.log('You\'ve finished all the challenges! Hooray!\n')
        } else {
          console.log(
              'You have '
            + remaining
            + ' challenge'
            + (remaining != 1 ? 's' : '')
            + ' left.'
          )
          console.log('Type `' + this.name + '` to show the menu.\n')
        }
        
        if (setup.close)
          setup.close()
      }.bind(this)
  )
}

function onfail (setup, dir, current) {
  if (setup.close) setup.close()
  
  console.log(bold(red('# FAIL')))
  if (typeof setup.verify == 'function')
    console.log('\nYour solution to ' + current + ' didn\'t pass. Try again!')
  else
    console.log('\nYour solution to ' + current + ' didn\'t match the expected output.\nTry again!')
}

function onselect (name) {
  console.log('\n  ' + repeat('#', 69))
  console.log(center(this.width, '~~  ' + name + '  ~~'))
  console.log('  ' + repeat('#', 69) + '\n')
  
  var dir  = this.dirFromName(name)
    , file = path.resolve(dir, 'problem.txt')

  this.updateData('current', function () {
    return name
  })

  printText(this.name, file, function () {
    console.log(
      bold('\n » To print these instructions again, run: `' + this.name + ' print`.'))
    console.log(
      bold(' » To execute your program in a test environment, run:\n   `' + this.name + ' run program.js`.'))
    console.log(
      bold(' » To verify your program, run: `' + this.name + ' verify program.js`.\n'))
  }.bind(this))
}

module.exports = Workshopper