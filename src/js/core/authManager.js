// authManager.js
export default class AuthManager {
    constructor() {
        this.currentUser = null;
        this.userRole = null;
        this.selectedPool = null;

        this.users = {
            'admin': { password: 'admin123', role: 'admin', pools: ['Pool A', 'Pool B'] },
            'user1': { password: 'user123', role: 'user', pools: ['Pool A'] },
            'user2': { password: 'user123', role: 'user', pools: ['Pool B'] }
        };

        this.loadUsers();
    }

    init() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        this.updateLoginDropdown();
        return this;
    }

    updateLoginDropdown() {
        const select = document.getElementById('username');
        if (!select) return;

        select.innerHTML = '<option value="">Select User</option>';

        Object.keys(this.users).forEach(userId => {
            const option = document.createElement('option');
            option.value = userId;
            option.textContent = userId === 'admin' ? 'Admin' :
                userId.charAt(0).toUpperCase() + userId.slice(1);
            select.appendChild(option);
        });
    }

    login(username, password, selectedPool = null) {
        if (this.users[username] && this.users[username].password === password) {
            const user = this.users[username];

            // Check pool access for non-admin users
            if (user.role !== 'admin') {
                if (!selectedPool) {
                    throw new Error('Pool selection is required for users');
                }
                if (!user.pools.includes(selectedPool)) {
                    throw new Error('You do not have access to the selected pool');
                }
                this.selectedPool = selectedPool;
            }

            this.currentUser = username;
            this.userRole = user.role;
            return true;
        }
        return false;
    }

    logout() {
        this.currentUser = null;
        this.userRole = null;
        this.selectedPool = null;
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }

    hasPermission(action, vesselOwner = null) {
        if (this.userRole === 'admin') return true;

        switch (action) {
            case 'edit_vessel':
                return vesselOwner === this.currentUser;
            case 'view_pool':
                return this.users[this.currentUser].pools.includes(this.selectedPool);
            case 'create_vessel':
            case 'delete_vessel':
            case 'create_pool':
                return false;
            default:
                return false;
        }
    }

    saveUsers() {
        try {
            const savedUsers = {};
            Object.keys(this.users).forEach(userId => {
                // Save all users except admin (to preserve admin security)
                // But allow saving updates to user1 and user2
                if (userId !== 'admin') {
                    savedUsers[userId] = this.users[userId];
                }
            });
            localStorage.setItem('auth_users', JSON.stringify(savedUsers));
        } catch (error) {
            console.warn('Could not save users to localStorage:', error);
        }
    }

    loadUsers() {
        try {
            const stored = localStorage.getItem('auth_users');
            if (stored) {
                const savedUsers = JSON.parse(stored);
                this.users = { ...this.users, ...savedUsers };

                // PROTECTION: Always ensure admin has correct role
                if (this.users['admin']) {
                    this.users['admin'].role = 'admin';
                    this.users['admin'].pools = ['Pool A', 'Pool B'];
                }
            }
        } catch (error) {
            console.warn('Could not load users from localStorage:', error);
        }
    }

    addUser(userId, userData) {
        // PROTECTION: Prevent admin role changes
        if (userId === 'admin' && userData.role !== 'admin') {
            console.warn('Attempted to change admin role in AuthManager - blocking');
            userData.role = 'admin';
        }

        this.users[userId] = userData;
        this.saveUsers();
        this.updateLoginDropdown();
    }

    updateUserData(userId, updates) {
        if (this.users[userId]) {
            // PROTECTION: Prevent admin role changes
            if (userId === 'admin' && updates.role && updates.role !== 'admin') {
                console.warn('Attempted to change admin role in AuthManager - blocking');
                updates.role = 'admin';
            }

            Object.assign(this.users[userId], updates);

            // Double-check admin role
            if (userId === 'admin') {
                this.users[userId].role = 'admin';
            }

            console.log(`Updated user ${userId}:`, this.users[userId]); // Debug line

            this.saveUsers();
            this.updateLoginDropdown();
        }
    }

    deleteUser(userId) {
        if (userId !== 'admin' && this.users[userId]) {
            delete this.users[userId];
            this.saveUsers();
            this.updateLoginDropdown();
        }
    }

    updatePoolDropdown() {
        const usernameSelect = document.getElementById('username');
        const poolGroup = document.getElementById('poolSelectionGroup');
        const poolSelect = document.getElementById('poolSelection');

        const selectedUser = usernameSelect.value;
        console.log('updatePoolDropdown called for user:', selectedUser); // Debug

        if (!selectedUser) {
            poolGroup.style.display = 'none';
            return;
        }

        const user = this.users[selectedUser];
        console.log('User data:', user); // Debug
        console.log('User pools:', user?.pools); // Debug

        if (!user) {
            poolGroup.style.display = 'none';
            return;
        }

        if (user.role === 'admin') {
            // Hide pool selection for admin
            poolGroup.style.display = 'none';
            poolSelect.removeAttribute('required');
        } else {
            // Show pool selection for regular users
            poolGroup.style.display = 'block';
            poolSelect.setAttribute('required', 'required');

            // Populate pools for this user
            poolSelect.innerHTML = '<option value="">Select Pool</option>';
            console.log('Adding pools:', user.pools); // Debug
            user.pools.forEach(poolName => {
                console.log('Adding pool option:', poolName); // Debug
                const option = document.createElement('option');
                option.value = poolName;
                option.textContent = poolName;
                poolSelect.appendChild(option);
            });

            console.log('Final pool select HTML:', poolSelect.innerHTML); // Debug

        }
    }
}