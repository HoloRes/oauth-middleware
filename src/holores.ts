// Imports
import { Router } from 'express';
import { client } from './index';
import * as config from '../config.json';

// Init
const router = Router();
export default router;

router.use((req, res, next) => {
	if (req.get('Authorization') === config.holores.token) next();
	else res.status(403).end();
});

// Routes
router.get('/adminCheck', async (req, res) => {
	const { id } = req.query;

	const guild = await client.guilds.fetch(config.holores.serverId)
		.catch(() => res.status(400).end());

	// @ts-expect-error Guild possibly null
	const member = await guild.members.fetch(<string>id)
		.catch(() => res.status(400).end());

	res.status(200).send(member.roles.cache.has(config.holores.adminRoleId));
});

router.get('/artistCheck', async (req, res) => {
	const { id } = req.query;

	const guild = await client.guilds.fetch(config.holores.serverId)
		.catch(() => res.status(400).end());

	// @ts-expect-error Guild possibly null
	const member = await guild.members.fetch(<string>id)
		.catch(() => res.status(400).end());

	res.status(200).send(member.roles.cache.has(config.holores.artistRoleId));
});
