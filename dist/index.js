"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = void 0;
// Imports
const express_1 = __importDefault(require("express"));
const passport_1 = __importDefault(require("passport"));
const express_session_1 = __importDefault(require("express-session"));
const passport_discord_1 = require("@oauth-everything/passport-discord");
const passport_http_bearer_1 = require("passport-http-bearer");
const passport_http_1 = require("passport-http");
const passport_oauth2_client_password_1 = require("passport-oauth2-client-password");
const discord_js_1 = __importDefault(require("discord.js"));
const mongoose_1 = __importDefault(require("mongoose"));
const oauth2orize_1 = __importDefault(require("oauth2orize"));
// Models
const biguint_format_1 = __importDefault(require("biguint-format"));
const flake_idgen_1 = __importDefault(require("flake-idgen"));
const User_1 = __importDefault(require("./models/User"));
const GroupLink_1 = __importDefault(require("./models/GroupLink"));
const Application_1 = __importDefault(require("./models/Application"));
const Code_1 = __importDefault(require("./models/Code"));
const AccessToken_1 = __importDefault(require("./models/AccessToken"));
// Local files
const jira_1 = require("./jira");
const util_1 = require("./util");
const config = require('../config.json');
const MongoDBStore = require('connect-mongodb-session')(express_session_1.default);
// Init
// eslint-disable-next-line import/prefer-default-export
exports.client = new discord_js_1.default.Client();
const flakeIdGen = new flake_idgen_1.default();
const oauth2Server = oauth2orize_1.default.createServer();
const app = express_1.default();
app.use(express_1.default.urlencoded());
app.use(express_1.default.json());
const store = new MongoDBStore({
    uri: `mongodb+srv://${config.mongodb.username}:${config.mongodb.password}@${config.mongodb.host}/${config.mongodb.database}`,
    collection: 'sessions',
});
const sessionOptions = {
    secret: config.expressSessionSecret,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 7,
    },
    store,
    resave: false,
    saveUninitialized: false,
};
if (app.get('env') === 'production') {
    app.set('trust proxy', 2); // trust first two proxies, CF and IIS
    sessionOptions.cookie.secure = true; // serve secure cookies
}
app.use(express_session_1.default(sessionOptions));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
app.listen(config.port);
// MongoDB
mongoose_1.default.connect(`mongodb+srv://${config.mongodb.username}:${config.mongodb.password}@${config.mongodb.host}/${config.mongodb.database}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
});
// Passport
// @ts-expect-error _id doesn't exist on user
passport_1.default.serializeUser((user, done) => done(null, user._id));
passport_1.default.deserializeUser((id, done) => {
    User_1.default.findById(id, (error, user) => done(error, user));
});
// eslint-disable-next-line max-len
passport_1.default.use(new passport_discord_1.Strategy(config.discord, (accessToken, refreshToken, profile, cb) => __awaiter(void 0, void 0, void 0, function* () {
    const guild = yield exports.client.guilds.fetch(config.discordServerId).catch((err) => {
        throw new Error(err);
    });
    // @ts-expect-error Not a valid Error type
    const member = yield (guild === null || guild === void 0 ? void 0 : guild.members.fetch(profile.id).catch(() => cb("You don't have the required permissions to login")));
    const baseRole = yield GroupLink_1.default.findOne({ baseRole: true }).lean().exec().catch((err) => {
        throw new Error(err);
    });
    // @ts-expect-error baseRole possibly null
    if (!(member === null || member === void 0 ? void 0 : member.user) || !member.roles.cache.has(baseRole === null || baseRole === void 0 ? void 0 : baseRole._id))
        cb("You don't have the required permissions to login");
    else {
        User_1.default.findById(profile.id, (err, doc) => __awaiter(void 0, void 0, void 0, function* () {
            if (err)
                throw new Error(err);
            if (!doc) {
                const newUser = new User_1.default({
                    _id: profile.id,
                    username: profile.username,
                });
                newUser.save((err2) => {
                    if (err2)
                        throw new Error(err2);
                });
                // @ts-expect-error Possible undefined
                jira_1.updateUserGroups(profile.id, profile.username).then(() => {
                    User_1.default.findById(profile.id, (err3, user) => {
                        if (err3)
                            throw new Error(err3);
                        cb(null, user);
                    }).catch((err4) => {
                        console.log(err4);
                    });
                });
            }
            else {
                if (!doc.jiraKey) {
                    // @ts-expect-error Possible undefined
                    jira_1.updateUserGroups(profile.id, profile.username).then(() => {
                        User_1.default.findById(profile.id, (err3, user) => {
                            if (err3)
                                throw new Error(err3);
                            cb(null, user);
                        }).catch((err2) => {
                            console.log(err2);
                        });
                    });
                }
                jira_1.updateUserGroupsByKey(profile.id, doc.jiraKey).then(() => {
                    cb(null, doc);
                });
            }
        }));
    }
})));
passport_1.default.use(new passport_http_bearer_1.Strategy((accessToken, callback) => {
    AccessToken_1.default.findOne({ token: accessToken }, (err, token) => {
        if (err)
            return callback(err);
        // No token found
        if (!token)
            return callback(null, false);
        User_1.default.findById(token.userId, (err2, user) => {
            if (err)
                return callback(err2);
            // No user found
            if (!user)
                return callback(null, false);
            // Simple example with no scope
            jira_1.updateUserGroupsByKey(user._id, user.jiraKey).then(() => {
                jira_1.findUserByKey(user.jiraKey).then((jiraUser) => {
                    callback(null, Object.assign(Object.assign({}, user._doc), { jiraUsername: jiraUser.name, username: jiraUser.name, displayName: jiraUser.name, email: user.mailcowEmail, id: jiraUser.name }), { scope: '*' });
                });
            });
        });
    });
}));
passport_1.default.use('client-basic', new passport_http_1.BasicStrategy((clientId, clientSecret, callback) => {
    Application_1.default.findById(clientId, (err, oauthClient) => {
        if (err)
            return callback(err);
        if (!oauthClient || oauthClient.clientSecret !== clientSecret)
            return callback(null, false);
        return callback(null, oauthClient);
    });
}));
passport_1.default.use(new passport_oauth2_client_password_1.Strategy((clientId, clientSecret, callback) => {
    Application_1.default.findById(clientId, (err, oauthClient) => {
        if (err)
            return callback(err);
        if (!oauthClient || oauthClient.clientSecret !== clientSecret)
            return callback(null, false);
        return callback(null, oauthClient);
    });
}));
// app.use('/holores', holoresRouter);
// Discord
exports.client.on('ready', () => {
    // eslint-disable-next-line no-console
    console.log('Discord client online');
    // @ts-expect-error User possibly undefined
    exports.client.user.setStatus('invisible');
});
exports.client.login(config.discordToken);
// OAuth2.0
oauth2Server.serializeClient((oauthClient, done) => done(null, oauthClient._id));
oauth2Server.deserializeClient((id, done) => {
    Application_1.default.findById(id, (error, oauthClient) => done(error, oauthClient));
});
oauth2Server.grant(oauth2orize_1.default.grant.code((oauthClient, redirectUri, user, ares, callback) => {
    const code = new Code_1.default({
        token: util_1.uid(16),
        clientId: oauthClient._id,
        redirectUri,
        userId: user._id,
    });
    code.save((err) => {
        if (err)
            callback(err);
        else
            callback(null, code.token);
    });
}));
oauth2Server.exchange(oauth2orize_1.default.exchange.code((oauthClient, code, redirectUri, callback) => {
    Code_1.default.findOne({ token: code }, (err, authCode) => {
        if (err)
            return callback(err);
        // eslint-disable-next-line max-len
        if (!authCode || oauthClient._id !== authCode.clientId || redirectUri !== authCode.redirectUri)
            return callback(null, false);
        // @ts-expect-error Callback is not options
        Code_1.default.findByIdAndDelete(authCode._id, (err2) => {
            if (err2)
                return callback(err2);
            const token = new AccessToken_1.default({
                token: util_1.uid(256),
                clientId: authCode.clientId,
                userId: authCode.userId,
            });
            token.save((err3) => {
                if (err3)
                    return callback(err3);
                callback(null, token.token);
            });
        });
    });
}));
// Routes
app.get('/auth/fail', (req, res) => {
    res.status(500).send("Sign in failed, you possibly don't have the required permissions to login");
});
app.get('/auth/logout', (req, res) => {
    req.logout();
    // @ts-expect-error not assignable to string
    if (req.query.redirectUrl)
        res.redirect(req.query.redirectUrl);
    else
        res.status(200).send('Signed out');
});
app.get('/auth/discord', passport_1.default.authenticate('discord'));
app.get('/auth/discord/callback', passport_1.default.authenticate('discord', {
    failureRedirect: '/auth/fail',
}), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const guild = yield exports.client.guilds.fetch(config.discordServerId).catch((err3) => {
        throw new Error(err3);
    });
    // @ts-expect-error Id not defined in User
    const member = yield (guild === null || guild === void 0 ? void 0 : guild.members.fetch((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).catch(() => res.status(401).send("You don't have the required permissions to login")));
    const baseRole = yield GroupLink_1.default.findOne({ baseRole: true }).lean().exec().catch(() => {
        res.status(500).send('Internal Server Error');
    });
    // @ts-expect-error member.roles and _id possibly undefined
    if (!member.roles.cache.has(baseRole === null || baseRole === void 0 ? void 0 : baseRole._id))
        return res.status(401).send("You don't have the required permissions to login");
    // @ts-expect-error redirect does not exist in the type
    if (req.session.redirect) {
        // @ts-expect-error redirect does not exist
        const { redirect } = req.session;
        // @ts-expect-error redirect does not exist
        req.session.redirect = undefined;
        return res.redirect(redirect);
    }
    res.status(200).send('Signed in');
}));
app.post('/oauth2/token', [passport_1.default.authenticate(['client-basic', 'oauth2-client-password'], { session: false }), oauth2Server.token(), oauth2Server.errorHandler()]);
app.get('/oauth2/authorize', (req, res, next) => {
    // @ts-expect-error never
    if (!req.session)
        req.session.regenerate();
    // @ts-expect-error redirect does not exist
    req.session.redirect = req.originalUrl;
    next();
}, (req, res, next) => {
    if (!req.isAuthenticated())
        res.redirect('/auth/discord');
    else
        next();
}, oauth2Server.authorize((clientID, redirectURI, done) => {
    Application_1.default.findById(clientID, (err, oauthClient) => {
        if (err) {
            return done(err);
        }
        if (!oauthClient) {
            return done(null, false);
        }
        if (oauthClient.redirectUrl !== redirectURI) {
            return done(null, false);
        }
        return done(null, oauthClient, oauthClient.redirectUrl);
    });
}), oauth2Server.decision());
app.get('/api/userinfo', passport_1.default.authenticate('bearer', { session: false }), (req, res) => {
    res.status(200).json(req.user);
});
app.get('/api/userByJiraKey', passport_1.default.authenticate('client-basic', { session: false }), (req, res) => {
    // @ts-expect-error Not assignable to
    User_1.default.findOne({ jiraKey: req.query.key }).lean()
        .exec((err, doc) => {
        if (err)
            return res.status(500).end();
        res.status(200).json(doc);
    });
});
app.get('/api/userByDiscordId', passport_1.default.authenticate('client-basic', { session: false }), (req, res) => {
    User_1.default.findById(req.query.id).lean()
        .exec((err, doc) => {
        if (err)
            return res.status(500).end();
        // @ts-expect-error doc possibly undefined
        jira_1.findUserByKey(doc.jiraKey)
            .then((jiraUser) => {
            res.status(200).json(Object.assign(Object.assign({}, doc), { username: jiraUser.name }));
        });
    });
});
app.post('/admin/application', (req, res) => {
    if (req.get('Authorization') !== config.adminToken)
        res.status(403).end();
    const application = new Application_1.default(Object.assign(Object.assign({ _id: biguint_format_1.default(flakeIdGen.next(), 'dec').toString() }, req.body), { clientSecret: util_1.uid(16) }));
    application.save((err) => {
        if (err)
            res.status(500).send(err);
        else
            res.status(201).json(application);
    });
});
app.delete('/admin/application', (req, res) => {
    if (req.get('Authorization') !== config.adminToken)
        res.status(403).end();
    Application_1.default.findByIdAndDelete(req.body.id).exec((err, application) => {
        if (err)
            res.status(500).send(err);
        if (!application)
            res.status(404).end();
        else
            res.status(200).json(application);
    });
});
app.get('/admin/application', (req, res) => {
    if (req.get('Authorization') !== config.adminToken)
        res.status(403).end();
    Application_1.default.findById(req.query.id).exec((err, application) => {
        if (err)
            res.status(500).send(err);
        if (!application)
            res.status(404).end();
        else
            res.status(200).json(application);
    });
});
app.post('/admin/groupLink', (req, res) => {
    if (req.get('Authorization') !== config.adminToken)
        res.status(403).end();
    const link = new GroupLink_1.default(req.body);
    link.save((err) => {
        if (err)
            res.status(500).send(err);
        else
            res.status(201).json(link);
    });
});
app.delete('/admin/groupLink', (req, res) => {
    if (req.get('Authorization') !== config.adminToken)
        res.status(403).end();
    GroupLink_1.default.findByIdAndDelete(req.body.id).exec((err, link) => {
        if (err)
            res.status(500).send(err);
        if (!link)
            res.status(404).end();
        else
            res.status(200).json(link);
    });
});
app.get('/admin/groupLink', (req, res) => {
    if (req.get('Authorization') !== config.adminToken)
        res.status(403).end();
    GroupLink_1.default.findById(req.query.id).exec((err, link) => {
        if (err)
            res.status(500).send(err);
        if (!link)
            res.status(404).end();
        else
            res.status(200).json(link);
    });
});
