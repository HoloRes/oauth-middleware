// Imports
import express from 'express';
import passport from 'passport';
import session from 'express-session';
import {
	Profile as DiscordProfile,
	Strategy as DiscordStrategy,
	VerifyCallback as DiscordVerifyCallback,
} from '@oauth-everything/passport-discord';
import { Strategy as BearerStrategy } from 'passport-http-bearer';
import { BasicStrategy } from 'passport-http';
import { Strategy as ClientPasswordStrategy } from 'passport-oauth2-client-password';
import Discord, { Intents } from 'discord.js';
import mongoose from 'mongoose';
import oauth2orize from 'oauth2orize';
import MongoDBSession from 'connect-mongodb-session';
import { Provider as OIDCProvider } from 'oidc-provider';
import helmet from 'helmet';
// @ts-expect-error Not exported
import type { Grant as OIDCGrant } from 'oidc-provider';

// Models
import intformat from 'biguint-format';
import FlakeId from 'flake-idgen';
import User, { Type as UserType } from './models/User';
import GroupLink from './models/GroupLink';
import Application from './models/Application';
import Code, { Type as CodeType } from './models/Code';
import AccessToken from './models/AccessToken';

// Local files
// eslint-disable-next-line import/no-cycle
import { updateUserGroups, updateUserGroupsByKey, findUserByKey } from './jira';
import { uid } from './util';
import OIDCAdapter from './oidc/adapter';
import { User as JiraUserType } from './types';

// Routers
// import holoresRouter from './holores';

const config = require('../config.json');

const MongoDBStore = MongoDBSession(session);

// Init
// eslint-disable-next-line import/prefer-default-export
export const client = new Discord.Client({
	intents: [
		Intents.FLAGS.DIRECT_MESSAGES,
	],
});

const flakeIdGen = new FlakeId();
const oauth2Server = oauth2orize.createServer();

const app = express();
app.use(express.urlencoded());
app.use(express.json());

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

app.use(helmet());
app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session());
app.listen(config.port);

// MongoDB
mongoose.connect(`mongodb+srv://${config.mongodb.username}:${config.mongodb.password}@${config.mongodb.host}/${config.mongodb.database}`, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	useFindAndModify: false,
});

// OpenID Connect
let oidcProvider: OIDCProvider;
(async () => {
	await OIDCAdapter.connect();

	oidcProvider = new OIDCProvider(process.env.URL ?? `http://localhost:${config.port}`, {
		adapter: OIDCAdapter,
		jwks: {
			keys: config.oidc.jwks,
		},
		routes: {
			authorization: '/auth/oidc',
			backchannel_authentication: '/oidc/backchannel',
			code_verification: '/oidc/device',
			device_authorization: '/oidc/device/auth',
			end_session: '/oidc/session/end',
			introspection: '/oidc/token/introspection',
			jwks: '/oidc/jwks',
			pushed_authorization_request: '/oidc/request',
			registration: '/oidc/reg',
			revocation: '/oidc/token/revocation',
			token: '/oidc/token',
			userinfo: '/oidc/me',
		},
		cookies: {
			keys: config.oidc.cookiesKeys,
			long: {
				signed: true,
			},
			short: {
				signed: true,
			},
		},
		claims: {
			acr: null,
			auth_time: null,
			iss: null,
			openid: [
				'sub',
				'email',
			],
			sid: null,
		},
		features: {
			devInteractions: {
				enabled: false,
			},
		},
		pkce: {
			methods: ['S256'],
			required: () => false,
		},
		findAccount: async (ctx, sub) => {
			const user = await User.findById(sub).exec();
			return {
				accountId: sub,
				async claims() {
					if (ctx.oidc.client!.clientId === 'cloudflare') {
						return {
							sub,
							email: 'cloudflare@hlresort.community',
							name: user?.lastKnownName ?? undefined,
							...user,
						};
					}
					return {
						sub,
						email: user?.mailcowEmail,
						name: user?.lastKnownName ?? undefined,
						...user,
					};
				},
			};
		},
	});
	if (app.get('env') === 'production') {
		oidcProvider.proxy = true;
	}

	app.use(oidcProvider.callback());
})();

// Passport
// @ts-expect-error _id doesn't exist on user
passport.serializeUser((user, done) => done(null, user._id));

passport.deserializeUser((id, done) => {
	User.findById(id, (error: any, user: any) => done(error, user));
});

// eslint-disable-next-line max-len
passport.use(new DiscordStrategy(config.discord, async (accessToken: string, refreshToken: string, profile: DiscordProfile, cb: DiscordVerifyCallback<UserType>) => {
	const guild = await client.guilds.fetch(config.discordServerId)
		.catch((err) => {
			throw new Error(err);
		});

	await guild.roles.fetch();

	const member = await guild?.members.fetch(profile.id)
		.catch((err) => {
			cb(new Error("You don't have the required permissions to login"));
			throw err;
		});

	if (!member) {
		cb(new Error(`Something went wrong, please try again later. Please report this error to the administrator. ERROR_CODE: DISCORD_FAILED_MEMBER_FETCH TIMESTAMP: ${new Date().toISOString()}`));
		return;
	}

	const baseRole = await GroupLink.findOne({ baseRole: true }).lean().exec()
		.catch((err) => {
			throw new Error(err);
		});

	if (!member?.user || (baseRole?._id && !member.roles.cache.has(baseRole._id))) {
		cb(new Error('You don\'t have the required permissions to login'));
	} else {
		const doc = await User.findById(profile.id).exec()
			.catch((err) => {
				throw err;
			});

		if (!doc) {
			const newUser = new User({
				_id: profile.id,
				username: profile.username,
			});
			newUser.save((err2: any) => {
				if (err2) throw new Error(err2);
			});

			await updateUserGroups(profile.id, profile.username!)
				.catch((err) => {
					cb(new Error(`Something went wrong, please try again later. Please report this error to the administrator. ERROR_CODE: JIRA_UPDATE_GROUPS TIMESTAMP: ${new Date().toISOString()}`));
					throw err;
				});

			const user = await User.findById(profile.id).exec()
				.catch((err) => {
					cb(new Error(`Something went wrong, please try again later. Please report this error to the administrator. ERROR_CODE: DB_FIND_USER TIMESTAMP: ${new Date().toISOString()}`));
					throw err;
				});

			cb(null, user!);
		} else if (!doc.jiraKey) {
			// @ts-expect-error Possible undefined
			await updateUserGroups(profile.id, profile.username)
				.catch((err) => {
					cb(new Error(`Something went wrong, please try again later. Please report this error to the administrator. ERROR_CODE: JIRA_UPDATE_GROUPS TIMESTAMP: ${new Date().toISOString()}`));
					throw err;
				});

			const user = await User.findById(profile.id).exec()
				.catch((err) => {
					cb(new Error(`Something went wrong, please try again later. Please report this error to the administrator. ERROR_CODE: DB_FIND_USER TIMESTAMP: ${new Date().toISOString()}`));
					throw err;
				});

			cb(null, user!);
		} else {
			try {
				await updateUserGroupsByKey(profile.id, doc.jiraKey!);
			} catch (e) {
				// eslint-disable-next-line max-len
				// Purposefully do not do anything with this error, a Jira user already exists, so no need to error the entire auth process.
			}

			cb(null, doc!);
		}
	}
}));

passport.use(new BearerStrategy(async (accessToken, cb) => {
	const token = await AccessToken.findOne({ token: accessToken }).exec()
		.catch((err) => {
			cb(err);
		});

	// No token found
	if (!token) return cb(null, false);

	const user = await User.findById(token.userId).exec()
		.catch((err) => {
			cb(err);
		});

	// No user found
	if (!user) return cb(null, false);

	if (!user.jiraKey) {
		await updateUserGroupsByKey(user._id, user.jiraKey!);
	} else {
		try {
			await updateUserGroupsByKey(user._id, user.jiraKey!);
		} catch (e) {
			// eslint-disable-next-line max-len
			// Purposefully do not do anything with this error, a Jira user already exists, so no need to error the entire auth process.
		}
	}

	let jiraUser: JiraUserType | null;

	if (user.lastKnownName) {
		try {
			jiraUser = await findUserByKey(user.jiraKey!);
		} catch (e) {
			// Purposefully do not do anything with this error
			jiraUser = null;
		}
	} else {
		jiraUser = await findUserByKey(user.jiraKey!);
	}

	cb(null, {
		...user._doc,
		jiraUsername: jiraUser?.name ?? user.lastKnownName,
		username: jiraUser?.name ?? user.lastKnownName,
		displayName: jiraUser?.name ?? user.lastKnownName,
		email: user.mailcowEmail,
		id: jiraUser?.name ?? user.lastKnownName,
	}, { scope: '*' });
}));

passport.use('client-basic', new BasicStrategy(async (clientId, clientSecret, cb) => {
	const oauthClient = await Application.findById(clientId).exec()
		.catch((err) => {
			cb(err);
		});

	if (!oauthClient || oauthClient.clientSecret !== clientSecret) return cb(null, false);
	return cb(null, oauthClient);
}));

passport.use(new ClientPasswordStrategy(async (clientId, clientSecret, cb) => {
	const oauthClient = await Application.findById(clientId).exec()
		.catch((err) => {
			cb(err);
		});

	if (!oauthClient || oauthClient.clientSecret !== clientSecret) return cb(null, false);
	return cb(null, oauthClient);
}));

// app.use('/holores', holoresRouter);

// Discord
client.on('ready', () => {
	// eslint-disable-next-line no-console
	console.log('Discord client online');
	// @ts-expect-error User possibly undefined
	client.user.setStatus('invisible');
});
client.login(config.discordToken);

// OAuth2.0
oauth2Server.serializeClient((oauthClient, done) => done(null, oauthClient._id));

oauth2Server.deserializeClient((id, done) => {
	Application.findById(id, (error: any, oauthClient: any) => done(error, oauthClient));
});

oauth2Server.grant(oauth2orize.grant.code((oauthClient, redirectUri, user, ares, callback) => {
	const code: CodeType = new Code({
		token: uid(16),
		clientId: oauthClient._id,
		redirectUri,
		userId: user._id,
	});

	code.save((err) => {
		if (err) callback(err);
		else callback(null, code.token);
	});
}));

oauth2Server.exchange(oauth2orize.exchange.code((oauthClient, code, redirectUri, callback) => {
	Code.findOne({ token: code }, (err: any, authCode: CodeType) => {
		if (err) return callback(err);
		// eslint-disable-next-line max-len
		if (!authCode || oauthClient._id !== authCode.clientId || redirectUri !== authCode.redirectUri) return callback(null, false);

		// @ts-expect-error Callback is not options
		Code.findByIdAndDelete(authCode._id, (err2: any) => {
			if (err2) return callback(err2);

			const token = new AccessToken({
				token: uid(256),
				clientId: authCode.clientId,
				userId: authCode.userId,
			});

			token.save((err3) => {
				if (err3) return callback(err3);
				callback(null, token.token);
			});
		});
	});
}));

// Heartbeat route
app.get('/heartbeat', (_, res) => {
	res.status(200).send('OK');
});

// OpenID Connect routes
app.get('/interaction/:uid',
	async (req, res, next) => {
		const details = await oidcProvider.interactionDetails(req, res);
		if (!details) res.status(400).end();
		else {
			// @ts-expect-error never
			if (!req.session) req.session.regenerate();
			// @ts-expect-error redirect does not exist
			req.session.redirect = req.originalUrl;
			// @ts-expect-error type does not exist
			req.session.type = 'oidc';
			next();
		}
	},
	(req, res, next) => {
		if (!req.isAuthenticated()) res.redirect('/auth/discord');
		else next();
	},
	async (req, res) => {
		const interactionDetails = await oidcProvider.interactionDetails(req, res);
		const { prompt: { details }, params } = interactionDetails;
		let { grantId } = interactionDetails;
		let grant: OIDCGrant;

		if (grantId) {
			grant = await oidcProvider.Grant.find(grantId);
		} else {
			grant = new oidcProvider.Grant({
				// @ts-expect-error _id doesn't exist on User
				accountId: req.user!._id,
				clientId: params.client_id as string,
			});
		}

		if (details.missingOIDCScope) {
			const { missingOIDCScope }: { missingOIDCScope?: string[] } = details;
			grant.addOIDCScope(missingOIDCScope.join(' '));
		}
		if (details.missingOIDCClaims) {
			grant.addOIDCClaims(details.missingOIDCClaims);
		}
		if (details.missingResourceScopes) {
			const { missingResourceScopes }: { missingResourceScopes?: object } = details;
			// eslint-disable-next-line no-restricted-syntax
			for (const [indicator, scopes] of Object.entries(missingResourceScopes)) {
				grant.addResourceScope(indicator, scopes.join(' '));
			}
		}

		grantId = await grant.save();

		const consent: any = {};
		if (!interactionDetails.grantId) {
			consent.grantId = grantId;
		}

		return oidcProvider.interactionFinished(req, res, {
			login: {
				// @ts-expect-error _id doesn't exist on User
				accountId: req.user!._id,
			},
			consent,
		});
	});

// Routes
app.get('/auth/fail', (req, res) => {
	// @ts-expect-error type does not exist
	if (req.session?.type === 'oidc') {
		return oidcProvider.interactionFinished(req, res, {
			error: 'access_denied',
			error_description: "Sign in failed, you possibly don't have the required permissions to login",
		});
	}
	res.status(500).send("Sign in failed, you possibly don't have the required permissions to login");
});

app.get('/auth/logout', (req, res) => {
	req.logout();
	// @ts-expect-error not assignable to string
	if (req.query.redirectUrl) res.redirect(req.query.redirectUrl);
	else res.status(200).send('Signed out');
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', passport.authenticate('discord', {
	failureRedirect: '/auth/fail',
}), async (req, res) => {
	const guild = await client.guilds.fetch(config.discordServerId).catch((err3) => {
		throw new Error(err3);
	});
	// @ts-expect-error Id not defined in User
	const member = await guild?.members.fetch(req.user?.id).catch(() => res.status(401).send("You don't have the required permissions to login"));

	const baseRole = await GroupLink.findOne({ baseRole: true }).lean().exec().catch(() => {
		res.status(500).send('Internal Server Error');
	});

	// @ts-expect-error member.roles and _id possibly undefined
	if (!member.roles.cache.has(baseRole?._id)) return res.status(401).send("You don't have the required permissions to login");
	// @ts-expect-error redirect does not exist in the type
	if (req.session.redirect) {
		// @ts-expect-error redirect does not exist
		const { redirect } = req.session;
		// @ts-expect-error redirect does not exist
		req.session.redirect = undefined;
		return res.redirect(redirect);
	} res.status(200).send('Signed in');
});

app.post('/oauth2/token', [passport.authenticate(['client-basic', 'oauth2-client-password'], { session: false }), oauth2Server.token(), oauth2Server.errorHandler()]);

app.get('/oauth2/authorize',
	(req, res, next) => {
		// @ts-expect-error never
		if (!req.session) req.session.regenerate();
		// @ts-expect-error redirect does not exist
		req.session.redirect = req.originalUrl;
		next();
	},
	(req, res, next) => {
		if (!req.isAuthenticated()) res.redirect('/auth/discord');
		else next();
	},
	oauth2Server.authorize(async (clientID, redirectURI, done) => {
		const oauthClient = await Application.findById(clientID).exec()
			.catch((err) => {
				done(err);
			});

		if (!oauthClient) {
			return done(null, false);
		}
		if (oauthClient.redirectUrl !== redirectURI) {
			return done(null, false);
		}

		return done(null, oauthClient, oauthClient.redirectUrl);
	}),
	oauth2Server.decision());

app.get('/api/userinfo', passport.authenticate('bearer', { session: false }), (req, res) => {
	res.status(200).json(req.user);
});

app.get('/api/userByJiraKey', passport.authenticate('client-basic', { session: false }), async (req, res) => {
	const doc = await User.findOne({ jiraKey: req.query.key as string }).lean().exec()
		.catch(() => {
			res.status(500).end();
		});
	if (!doc) res.status(404).end();

	res.status(200).json(doc);
});

app.get('/api/userByDiscordId', passport.authenticate('client-basic', { session: false }), async (req, res) => {
	const doc = await User.findById(req.query.id).lean().exec()
		.catch(() => {
			res.status(500).end();
		});

	if (!doc) return res.status(404).end();

	const jiraUser = await findUserByKey(doc.jiraKey!)
		.catch(() => {
			res.status(404).end();
		}) as JiraUserType;

	res.status(200).json({
		...doc,
		username: jiraUser.name,
	});
});

app.get('/api/updateUserGroups', passport.authenticate('client-basic', { session: false }), async (req, res) => {
	const doc = await User.findById(req.query.id).lean().exec()
		.catch(() => {
			res.status(500).end();
		});

	if (!doc) return res.status(404).end();

	await updateUserGroupsByKey(doc._id, doc.jiraKey!)
		.catch((err) => {
			console.log(err);
			res.status(500).end();
		});

	res.status(204).end();
});

app.post('/admin/application', (req, res) => {
	if (req.get('Authorization') !== config.adminToken) res.status(403).end();

	const application = new Application({
		_id: intformat(flakeIdGen.next(), 'dec').toString(),
		...req.body,
		clientSecret: uid(16),
	});

	application.save((err) => {
		if (err) res.status(500).send(err);

		else res.status(201).json(application);
	});
});

app.delete('/admin/application', (req, res) => {
	if (req.get('Authorization') !== config.adminToken) res.status(403).end();

	Application.findByIdAndDelete(req.body.id).exec((err, application) => {
		if (err) res.status(500).send(err);

		if (!application) res.status(404).end();

		else res.status(204).end();
	});
});

app.get('/admin/application', (req, res) => {
	if (req.get('Authorization') !== config.adminToken) res.status(403).end();

	Application.findById(req.query.id).exec((err, application) => {
		if (err) res.status(500).send(err);

		if (!application) res.status(404).end();

		else res.status(200).json(application);
	});
});

app.post('/admin/groupLink', (req, res) => {
	if (req.get('Authorization') !== config.adminToken) res.status(403).end();

	const link = new GroupLink(req.body);
	link.save((err) => {
		if (err) res.status(500).send(err);

		else res.status(201).json(link);
	});
});

app.delete('/admin/groupLink', (req, res) => {
	if (req.get('Authorization') !== config.adminToken) res.status(403).end();

	GroupLink.findByIdAndDelete(req.body.id).exec((err, link) => {
		if (err) res.status(500).send(err);

		if (!link) res.status(404).end();

		else res.status(204).end();
	});
});

app.get('/admin/groupLink', (req, res) => {
	if (req.get('Authorization') !== config.adminToken) res.status(403).end();

	GroupLink.findById(req.query.id).exec((err, link) => {
		if (err) res.status(500).send(err);

		if (!link) res.status(404).end();

		else res.status(200).json(link);
	});
});
