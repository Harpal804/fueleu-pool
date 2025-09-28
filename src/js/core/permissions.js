export class PermissionManager {
    static PERMISSIONS = {
        // Pool permissions
        CREATE_POOL: 'create_pool',
        EDIT_POOL: 'edit_pool',
        DELETE_POOL: 'delete_pool',
        VIEW_POOL: 'view_pool',

        // Vessel permissions
        CREATE_VESSEL: 'create_vessel',
        EDIT_VESSEL: 'edit_vessel',
        DELETE_VESSEL: 'delete_vessel',
        VIEW_VESSEL: 'view_vessel',

        // System permissions
        ADMIN_ACCESS: 'admin_access'
    };

    static hasPermission(user, permission, resource = null) {
        if (!user) return false;

        switch (permission) {
            case this.PERMISSIONS.CREATE_POOL:
            case this.PERMISSIONS.DELETE_POOL:
            case this.PERMISSIONS.DELETE_VESSEL:
                return user.role === 'admin';

            case this.PERMISSIONS.VIEW_POOL:
                if (!resource) return false;
                return user.role === 'admin' || user.pools.includes(resource.name);

            case this.PERMISSIONS.CREATE_VESSEL:
                return user.role === 'admin' || user.role === 'user';

            case this.PERMISSIONS.EDIT_VESSEL:
                if (!resource) return false;
                return user.role === 'admin' || resource.owner === user.id;

            case this.PERMISSIONS.VIEW_VESSEL:
                if (!resource) return false;
                return user.role === 'admin' ||
                    (user.pools.includes(resource.pool) && resource.pool);

            default:
                return false;
        }
    }

    static canCreatePool(user) {
        return this.hasPermission(user, this.PERMISSIONS.CREATE_POOL);
    }

    static canDeletePool(user) {
        return this.hasPermission(user, this.PERMISSIONS.DELETE_POOL);
    }

    static canCreateVessel(user) {
        return this.hasPermission(user, this.PERMISSIONS.CREATE_VESSEL);
    }

    static canEditVessel(user, vessel) {
        return this.hasPermission(user, this.PERMISSIONS.EDIT_VESSEL, vessel);
    }

    static canDeleteVessel(user) {
        if (!user) return false;
        return user.role === 'admin'; // Admin can always delete vessels
    }

    static canViewPool(user, pool) {
        return this.hasPermission(user, this.PERMISSIONS.VIEW_POOL, pool);
    }

    static canViewVessel(user, vessel) {
        return this.hasPermission(user, this.PERMISSIONS.VIEW_VESSEL, vessel);
    }

    static getAvailablePoolsForUser(user, allPools) {
        if (user.role === 'admin') {
            return allPools;
        }

        return allPools.filter(pool => this.canViewPool(user, pool));
    }

    static getAvailableUsersForPool(allUsers, poolName) {
        return allUsers.filter(user =>
            user.role === 'admin' || user.pools.includes(poolName)
        );
    }

    // NEW: Check if user can modify vessels in a pool
    static canModifyPool(user, poolName, poolManager) {
        if (!user || !poolName) return false;

        // Admin can always modify (including changing read-only status)
        if (user.role === 'admin') return true;

        // Check if pool is read-only
        if (poolManager && poolManager.isPoolReadOnly(poolName)) {
            return false; // No modifications allowed in read-only pools
        }

        // Check if user has access to the pool
        return user.pools.includes(poolName);
    }

    // NEW: Check if user can create vessels in a pool
    static canCreateVesselInPool(user, poolName, poolManager) {
        if (!user || !poolName) return false;

        // Admin can create vessels even in read-only pools (for management purposes)
        if (user.role === 'admin') return true;

        // Users cannot create vessels in read-only pools
        if (poolManager && poolManager.isPoolReadOnly(poolName)) {
            return false;
        }

        // Regular permission check
        return this.canCreateVessel(user) && user.pools.includes(poolName);
    }

    // NEW: Check if user can edit a vessel (considering pool read-only status)
    static canEditVesselInPool(user, vessel, poolManager) {
        if (!user || !vessel) return false;

        // Admin can edit vessels even in read-only pools
        if (user.role === 'admin') return true;

        // Users cannot edit vessels in read-only pools
        if (poolManager && poolManager.isPoolReadOnly(vessel.pool)) {
            return false;
        }

        // Regular permission check (user owns the vessel)
        return this.canEditVessel(user, vessel);
    }

    // NEW: Check if user can delete a vessel (considering pool read-only status)
    static canDeleteVesselInPool(user, vessel, poolManager) {
        if (!user || !vessel) return false;

        // Admin can delete vessels from any pool, even read-only ones
        if (user.role === 'admin') return true;

        // Users cannot delete vessels in read-only pools
        if (poolManager && poolManager.isPoolReadOnly(vessel.pool)) {
            return false;
        }

        // Regular permission check: user can delete their own vessels
        return vessel.owner === user.id;
    }

    // NEW: Check if user can set pool read-only status
    static canSetPoolReadOnly(user) {
        return user && user.role === 'admin';
    }

    // HELPER: Check if admin has override permissions
    static hasAdminOverride(user) {
        return user && user.role === 'admin';
    }

    // UPDATED: Enhanced read-only message with admin context
    static getReadOnlyMessage(poolName, isAdmin = false) {
        if (isAdmin) {
            return `Pool "${poolName}" is in read-only mode for users. As admin, you can still make changes.`;
        }
        return `Pool "${poolName}" is currently in read-only mode. Contact your administrator to make changes.`;
    }
}