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

interface User extends CreatedUser {

}
