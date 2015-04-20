
var utils = require('./lib')

function sanitizeConfig(config) {
  if (!config.auth) return false
  return {
    url: config.url,
    display_url: config.display_url,
    cache: config.cache,
    auth: {
      type: config.auth.type,
      privkey: config.auth.privkey,
      pubkey: config.auth.pubkey,
      username: config.auth.username,
      password: config.auth.password
    }
  }
}

module.exports = {
  config: {
    url: String,
    display_url: String,
    cache: Boolean,
    auth: {
      type: { type: String, enum: ['ssh', 'https', 'http'] },
      privkey: String,
      pubkey: String,
      username: String,
      password: String
    }
  },
  getBranches: function (userConfig, config, project, done) {
    if(!project.privkey)
      project.privkey = utils.sshkey_extract(project.branches);
    utils.getBranches(config, project.privkey, done)
  },
  
  fastFile: false,
  getFile: function (filename, ref, config, project, done) {
    var err = { data: 'Not Found', status: 404 }
      , body = 'Not Found'
    done(err, body);
  },

  routes: function (app, context) {
    app.get('config', context.auth.requireProjectAdmin, function (req, res) {
      res.send(req.providerConfig())
    })
    app.put('config', context.auth.requireProjectAdmin, function (req, res) {
      // validate the config
      var config = sanitizeConfig(req.body)
      req.providerConfig(config, function (err) {
        if (err) {
          res.status(500)
          return res.send({errors: [err.message]})
        }
        res.send({success: true, message: 'Saved mercurial config!', config: config})
      })
    })
  }
}

