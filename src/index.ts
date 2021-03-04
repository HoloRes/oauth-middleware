// Imports
import express from 'express';
import passport from 'passport';
import DiscordStrategy from 'passport-discord';

// Models
import User, { Type as UserType } from './models/User';

// Local files
import { UpdateUserGroups } from './jira';

const config = require('../config.json');

// Init
const app = express();
app.use(express.json());
app.listen(config.port);

passport.use(new DiscordStrategy(config.discord, (accessToken, refreshToken, profile, cb) => {
	const user = User.findById(profile.id, (err: any, doc: UserType) => {
		if (err) throw new Error(err);
		if (!doc) {
			const newUser = new User({ _id: profile.id });
			newUser.save((err2: any) => {
				if (err2) throw new Error(err2);
				UpdateUserGroups();
				cb(null, user);
			});
		} else {
			UpdateUserGroups();
			cb(null, user);
		}
	});
}));

// Routes
app.get('/authenticate');
