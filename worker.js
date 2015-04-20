
var exec   = require('child_process').exec
  , path  = require('path')
  , fs    = require('fs-extra')
  , spawn = require('child_process').spawn
  , utils = require('./lib')

function safespawn() {
  var c
  try {
    c = spawn.apply(null, arguments)
  } catch (e) {
    throw new Error('Failed to start command: ' + JSON.stringify([].slice.call(arguments)))
  }
  c.on('error', function (err) {
    // suppress node errors
  })
  return c
}

function clone_command(config, branch) {
  var urls = (config.auth.type === 'ssh') ? utils.sshUrl(config) : utils.httpUrl(config)
    , screen = 'hg clone ' + urls[1] + ' .'
    , args = ['clone', urls[0], '.']
  if (branch) {
    args = args.concat(['-b', branch])
    screen += ' -b ' + branch
  }
  return {
    command: 'hg',
    args: args,
    screen: screen
  }
}

function pull(dest, config, context, branch, done) {
  utils.hgCmd('hg pull -r ' + branch, dest, context, function (exitCode) { 
    utils.hgCmd('hg update ' + branch + ' --clean' , dest, context, done)
  })
}

function clone(dest, config, ref, context, done) {
  utils.hgCmd(clone_command(config, ref.branch), dest, context, done) 
}

function badCode(name, code) {
  var e = new Error(name + ' failed with code ' + code)
  e.code = code
  e.exitCode = code
  return e
}

module.exports = {
  init: function (dirs, config, job, done) {
    return done(null, {
      config: config,
      fetch: function (context, done) {
        module.exports.fetch(dirs.data, config, job, context, done)
      }
    })
  },
  fetch: fetch
}

function checkoutRef(dest, context, ref, done) {
  return utils.hgCmd('hg update --clean ' + utils.shellEscape(ref.id || ref.branch), dest, context, function (exitCode) {
    utils.sshkey_delete();
    done(exitCode && badCode('checkoutRef', exitCode));
  })
}

function fetch(dest, config, job, context, done) {
  if (config.auth.type === 'ssh') {
    if(!config.auth.privkey)
      config.auth.privkey = utils.sshkey_extract(job.project.branches);
    utils.sshkey_install(config.auth.privkey);
  }

  // dirty hack: 'master' name for main branch is hardcoded in strider core, but mercurial use 'default'
  if(job.ref.branch === 'master')
  {
    job.ref.branch = 'default'
  }

  var cloning = false
    , pleaseClone = function () {
        cloning = true
        fs.mkdirp(dest, function () {
          clone(dest, config, job.ref, context, updateCache)
        })
      }
  if (!config.cache) return pleaseClone()

  context.cachier.get(dest, function (err) {
    if (err) return pleaseClone()
    // make sure .hg exists
    fs.exists(path.join(dest, '.hg'), function (exists) {
      if (exists) {
        context.comment('restored code from cache')
        return pull(dest, config, context, job.ref.branch, updateCache)
      }
      fs.remove(dest, function(err) {
        pleaseClone()
      })
    })
  })

  function updateCache(exitCode) {
    if (exitCode) return done(badCode('Hg ' + (cloning ? 'clone' : 'pull'), exitCode))
    if (!config.cache) return gotten()
    context.comment('saved code to cache')
    context.cachier.update(dest, gotten)
  }

  function gotten (err) {
    if (err) return done(err)
    // fetch the ref
    if (job.ref.branch && !job.ref.fetch) {
      return checkoutRef(dest, context, job.ref, done)
    }
    fetchRef(job.ref.fetch, dest, config.auth, context, done)
  }
}

function fetchRef(what, dest, auth, context, done) {
  utils.hgCmd('hg pull ' + utils.shellEscape(what), dest, context, function (exitCode) {
    if (exitCode) return done(badCode('Pull ' + what, exitCode))
    utils.hgCmd('hg update --clean', dest, context, function (exitCode) {
      utils.sshkey_delete();
      done(exitCode && badCode('fetchRef', exitCode))
    })
  })
}


