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
        return this.hasPermission(user, this.PERMISSIONS.DELETE_VESSEL);
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
}