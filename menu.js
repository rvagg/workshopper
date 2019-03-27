const tmenu        = require('terminal-menu')
    , path         = require('path')
    , fs           = require('fs')
    , xtend        = require('xtend')
    , EventEmitter = require('events').EventEmitter
    , chalk        = require('chalk')
    , util         = require('util')

const repeat          = require('./util').repeat
    , applyTextMarker = require('./util').applyTextMarker
    , maxListenersPerEvent = 10


function showMenu (opts, i18n) {

  var emitter         = new EventEmitter()
    , menu            = tmenu(xtend({
          width : opts.width
        , x     : 3
        , y     : 2
      }, opts.menu))
    , __              = i18n.__
    , __n             = i18n.__n
    , menuStream

  function writeLine() {
    menu.write(repeat('\u2500', opts.width) + '\n')
  }

  function emit(event, value) {
    return process.nextTick.bind(process, emitter.emit.bind(emitter, event, value))
  }

  function addEntry(entry) {
    menu.add(applyTextMarker(entry.name, entry.marker || '', opts.width), emit(entry.event, entry.payload))
  }

  function addVariableEntry(variableEntry) {
    if (!variableEntry)
      return

    if (util.isArray(variableEntry))
      return variableEntry.forEach(addVariableEntry)

    if (variableEntry.separator)
      return writeLine()

    addEntry(variableEntry)
  }

  menu.reset()

  menu.write(chalk.bold(__('title')) + '\n')

  if (i18n.has('subtitle'))
    menu.write(chalk.italic(__('subtitle')) + '\n')

  writeLine()

  menu.setMaxListeners(opts.entries.length * maxListenersPerEvent)
  opts.entries.forEach(addVariableEntry)

  function regexpEncode(str) {
    return str.replace(/([\.\*\+\?\{\}\[\]\- \(\)\|\^\$\\])/g, "\\$1")
  }

  function passDataToMenu(data) {
    // Node 0.10 fix
    menuStream.write(data)
  }

  menu.on('select', function (label) {
    menu.y = 0
    menu.reset()
    menu.close()
  })

  menu.on('close', function () {
    process.stdin.pause()
    process.stdin.removeListener('data', passDataToMenu)
    menuStream.unpipe(process.stdout)
    process.stdin.unpipe(menuStream)
    process.stdin.setRawMode(false)
  })

  menuStream = menu.createStream()
  process.stdin
    .on("data", passDataToMenu)

  menuStream.pipe(process.stdout, {end: false})

  if(!process.stdin.isTTY) {
    menu.reset()
    console.error(__('error.notty'))
    process.exit(1)
  } else {
    process.stdin.setRawMode(true)
  }
    
  process.stdin.resume()

  return emitter
}


module.exports = showMenu
