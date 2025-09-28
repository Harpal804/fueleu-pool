export default class UserManager {
    constructor() {
        this.users = {
            'admin': {
                id: 'admin',
                role: 'admin',
                pools: ['Pool A', 'Pool B'],
                name: 'System Administrator',
                permissions: ['create_pool', 'delete_pool', 'create_vessel', 'edit_all_vessels', 'delete_vessel']
            },
            'user1': {
                id: 'user1',
                role: 'user',
                pools: ['Pool A'],
                name: 'User One',
                permissions: ['create_vessel', 'edit_own_vessels']
            },
            'user2': {
                id: 'user2',
                role: 'user',
                pools: ['Pool B'],
                name: 'User Two',
                permissions: ['create_vessel', 'edit_own_vessels']
            }
        };

        this.storageKey = 'fueleu_users';
        try {
            this.loadFromStorage();

            if (Object.keys(this.users).length === 0) {
                this.initializeDefaultUsers();
            }
        } catch (error) {
            console.warn('Error during UserManager initialization:', error);
            this.initializeDefaultUsers();
        }
    }

    getUser(userId) {
        return this.users[userId];
    }

    getAllUsers() {
        return Object.values(this.users);
    }

    getUsersByRole(role) {
        return Object.values(this.users).filter(user => user.role === role);
    }

    getUsersInPool(poolName) {
        return Object.values(this.users).filter(user =>
            user.pools.includes(poolName)
        );
    }

    updateUserPools(userId, pools) {
        const user = this.users[userId];
        if (!user) {
            throw new Error('User not found');
        }

        user.pools = pools;
        return user;
    }

    addUserToPool(userId, poolName) {
        const user = this.users[userId];
        if (!user) {
            throw new Error('User not found');
        }

        if (!user.pools.includes(poolName)) {
            user.pools.push(poolName);
        }

        return user;
    }

    removeUserFromPool(userId, poolName) {
        const user = this.users[userId];
        if (!user) {
            throw new Error('User not found');
        }

        user.pools = user.pools.filter(pool => pool !== poolName);
        return user;
    }

    isUserInPool(userId, poolName) {
        const user = this.users[userId];
        return user && user.pools.includes(poolName);
    }

    canUserAccessPool(userId, poolName) {
        const user = this.users[userId];
        if (!user) return false;

        return user.role === 'admin' || user.pools.includes(poolName);
    }

    createUser(userData) {
        if (this.users[userData.id]) {
            throw new Error(`User with ID "${userData.id}" already exists`);
        }

        this.users[userData.id] = {
            id: userData.id,
            name: userData.name,
            role: userData.role || 'user',
            pools: userData.pools || [],
            permissions: userData.role === 'admin'
                ? ['create_pool', 'delete_pool', 'create_vessel', 'edit_all_vessels', 'delete_vessel']
                : ['create_vessel', 'edit_own_vessels'],
            created: new Date().toISOString()
        };

        this.saveToStorage();
        return this.users[userData.id];
    }

    updateUser(userId, updates) {
        console.log('updateUser called with:', { userId, updates });

        const user = this.users[userId];
        if (!user) {
            throw new Error('User not found');
        }


        // Check if updates is valid
        if (!updates || typeof updates !== 'object') {
            console.warn('updateUser called with invalid updates object:', updates);
            return user;
        }

        // Only proceed if there are actual updates to make
        if (Object.keys(updates).length === 0) {
            return user;
        }

        // PROTECTION: Never allow admin role to be changed
        if (userId === 'admin' && updates.role && updates.role !== 'admin') {
            console.warn('Attempted to change admin role - blocking this change');
            updates = { ...updates, role: 'admin' }; // Force admin role
        }

        // Don't allow changing user ID
        const { id, ...allowedUpdates } = updates;

        Object.assign(user, allowedUpdates, {
            lastUpdated: new Date().toISOString()
        });

        // Ensure admin always has admin role and permissions
        if (userId === 'admin') {
            user.role = 'admin';
            user.permissions = ['create_pool', 'delete_pool', 'create_vessel', 'edit_all_vessels', 'delete_vessel'];
            // Only update permissions if role is actually being changed
        } else if (updates.hasOwnProperty('role')) {
            if (updates.role === undefined || updates.role === null) {
                console.error('Role is undefined in updates:', updates);
                throw new Error('Role is not defined');
            }
            user.permissions = updates.role === 'admin'
                ? ['create_pool', 'delete_pool', 'create_vessel', 'edit_all_vessels', 'delete_vessel']
                : ['create_vessel', 'edit_own_vessels'];
        }

        this.saveToStorage();
        return user;
    }

    deleteUser(userId) {
        if (!this.users[userId]) {
            throw new Error('User not found');
        }

        if (userId === 'admin') {
            throw new Error('Cannot delete the admin user');
        }

        delete this.users[userId];
        this.saveToStorage();
        return true;
    }

    getUserCount() {
        return Object.keys(this.users).length;
    }

    initializeDefaultUsers() {
        this.users = {
            'admin': {
                id: 'admin',
                role: 'admin',
                pools: ['Pool A', 'Pool B'],
                name: 'System Administrator',
                permissions: ['create_pool', 'delete_pool', 'create_vessel', 'edit_all_vessels', 'delete_vessel']
            },
            'user1': {
                id: 'user1',
                role: 'user',
                pools: ['Pool A'],
                name: 'User One',
                permissions: ['create_vessel', 'edit_own_vessels']
            },
            'user2': {
                id: 'user2',
                role: 'user',
                pools: ['Pool B'],
                name: 'User Two',
                permissions: ['create_vessel', 'edit_own_vessels']
            }
        };
        this.saveToStorage();
    }

    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.users));
        } catch (error) {
            console.warn('Could not save users to localStorage:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.users = JSON.parse(stored);
                // PROTECTION: Ensure admin user always has correct role
                if (this.users['admin']) {
                    this.users['admin'].role = 'admin';
                    this.users['admin'].permissions = ['create_pool', 'delete_pool', 'create_vessel', 'edit_all_vessels', 'delete_vessel'];
                }
            } else {
                this.users = {};
            }
        } catch (error) {
            console.warn('Could not load users from localStorage:', error);
            this.users = {};
        }
    }
}