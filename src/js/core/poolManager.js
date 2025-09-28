export default class PoolManager {
    constructor() {
        this.pools = {};
        this.storageKey = 'fueleu_pools';
        this.loadFromStorage();

        // Initialize with sample pools if empty
        if (Object.keys(this.pools).length === 0) {
            this.initializeSamplePools();
        }
    }

    // Storage methods
    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.pools));
        } catch (error) {
            console.warn('Could not save pools to localStorage:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.pools = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Could not load pools from localStorage:', error);
            this.pools = {};
        }
    }

    initializeSamplePools() {
        this.pools = {
            'Pool A': {
                id: 'pool-a',
                name: 'Pool A',
                description: 'ABC',
                manager: 'admin',
                created: new Date().toISOString(),
                vesselCount: 0
            },
            'Pool B': {
                id: 'pool-b',
                name: 'Pool B',
                description: 'DEF',
                manager: 'admin',
                created: new Date().toISOString(),
                vesselCount: 0
            }
        };
        this.saveToStorage();
    }

    // Pool CRUD operations
    createPool(poolData) {
        if (!poolData.name || !poolData.name.trim()) {
            throw new Error('Pool name is required');
        }

        const poolName = poolData.name.trim();

        if (this.pools[poolName]) {
            throw new Error(`Pool "${poolName}" already exists`);
        }

        const pool = {
            id: poolName.toLowerCase().replace(/\s+/g, '-'),
            name: poolName,
            description: poolData.description || '',
            manager: poolData.manager || 'admin',
            created: new Date().toISOString(),
            vesselCount: 0
        };

        this.pools[poolName] = pool;
        this.saveToStorage();

        console.log('Pool created:', pool);
        return pool;
    }

    updatePool(poolName, updates) {
        const pool = this.pools[poolName];
        if (!pool) {
            throw new Error('Pool not found');
        }

        // Don't allow name changes that would conflict
        if (updates.name && updates.name !== poolName && this.pools[updates.name]) {
            throw new Error(`Pool "${updates.name}" already exists`);
        }

        Object.assign(pool, updates, {
            lastUpdated: new Date().toISOString()
        });

        this.saveToStorage();
        return pool;
    }

    deletePool(poolName) {
        if (!this.pools[poolName]) {
            throw new Error('Pool not found');
        }

        delete this.pools[poolName];
        this.saveToStorage();

        console.log('Pool deleted:', poolName);
        return true;
    }

    getPool(poolName) {
        return this.pools[poolName];
    }

    getAllPools() {
        return Object.values(this.pools);
    }

    getPoolNames() {
        return Object.keys(this.pools);
    }

    poolExists(poolName) {
        return !!this.pools[poolName];
    }

    // Vessel assignment methods
    assignVesselToPool(vesselId, poolName) {
        if (!this.pools[poolName]) {
            throw new Error(`Pool "${poolName}" does not exist`);
        }
        // This will be called by VesselManager when vessels are added/moved
        return true;
    }

    updateVesselCount(poolName, count) {
        if (this.pools[poolName]) {
            this.pools[poolName].vesselCount = count;
            this.saveToStorage();
        }
    }

    // Get pools by user access
    getPoolsForUser(userRole, userPools) {
        if (userRole === 'admin') {
            return this.getAllPools();
        } else {
            return this.getAllPools().filter(pool =>
                userPools.includes(pool.name)
            );
        }
    }
}