#!/usr/bin/env node


const workshopper = require('../')
    , path        = require('path')


workshopper({
    name        : 'foo'
  , title       : 'FOO OR DIE'
  , exerciseDir : path.join(__dirname, 'exercises')
  , appDir      : __dirname
  , languages   : ['de', 'en', 'es', 'fr', 'it', 'ja', 'pt-br', 'ru', 'vi', 'zh-cn', 'zh-tw', 'ko', 'nb-no']
})
