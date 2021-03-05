interface Group {
	name: string,
	self: string
}

export interface CreatedUser {
	self: string,
	key: string,
	name: string,
	emailAddress: string,
	displayName: string
}

export interface User extends CreatedUser {
	avatarUrls: object,
	active: boolean,
	timeZone: string,
	locale: string,
	groups: {
		size: number,
		items: Array<Group>
	},
	applicationRoles: {
		size: number,
		items: Array<string>
	},
	expand: string
}
