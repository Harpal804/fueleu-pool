export default class PoolManager {
    constructor() {
        this.pools = {};
        this.storageKey = 'fueleu_pools';

        console.log('🏊 PoolManager constructor called');

        // Load existing data first
        this.loadFromStorage();

        // Only initialize sample pools if NO pools exist
        if (Object.keys(this.pools).length === 0) {
            console.log('📦 No pools found, initializing sample pools');
            this.initializeSamplePools();
        } else {
            console.log(`✅ Loaded ${Object.keys(this.pools).length} existing pools`);
            // Ensure backward compatibility for readOnly property
            this.ensureReadOnlyProperty();

            // Log current pool states
            Object.values(this.pools).forEach(pool => {
                console.log(`  - ${pool.name}: readOnly=${pool.readOnly}, vesselCount=${pool.vesselCount}`);
            });
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
                vesselCount: 0,
                readOnly: false  // NEW: Read-only flag
            },
            'Pool B': {
                id: 'pool-b',
                name: 'Pool B',
                description: 'DEF',
                manager: 'admin',
                created: new Date().toISOString(),
                vesselCount: 0,
                readOnly: false  // NEW: Read-only flag
            }
        };

        console.log('📦 Sample pools initialized with readOnly=false');
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
            vesselCount: 0,
            readOnly: poolData.readOnly || false  // NEW: Default to writable
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

    // NEW: Set pool read-only status
    setPoolReadOnly(poolName, isReadOnly) {
        const pool = this.pools[poolName];
        if (!pool) {
            throw new Error('Pool not found');
        }

        pool.readOnly = isReadOnly;
        pool.lastUpdated = new Date().toISOString();
        this.saveToStorage();

        console.log(`Pool "${poolName}" ${isReadOnly ? 'set to' : 'removed from'} read-only mode`);
        return pool;
    }

    // NEW: Check if pool is read-only
    isPoolReadOnly(poolName) {
        const pool = this.pools[poolName];
        return pool ? pool.readOnly : false;
    }

    // NEW: Get read-only pools
    getReadOnlyPools() {
        return Object.values(this.pools).filter(pool => pool.readOnly);
    }

    // NEW: Get writable pools
    getWritablePools() {
        return Object.values(this.pools).filter(pool => !pool.readOnly);
    }

    updateVesselCount(poolName, count) {
        const pool = this.pools[poolName];
        if (!pool) {
            console.warn(`⚠️ Pool ${poolName} not found for vessel count update`);
            return;
        }

        // Only update vessel count, preserve ALL other properties
        const previousReadOnly = pool.readOnly;
        pool.vesselCount = count;
        pool.lastUpdated = new Date().toISOString();

        // CRITICAL: Ensure readOnly status is preserved
        if (typeof previousReadOnly !== 'undefined') {
            pool.readOnly = previousReadOnly;
        }

        this.saveToStorage();

        console.log(`✅ Pool ${poolName}: count=${count}, readOnly=${pool.readOnly} (preserved)`);
    }

    // CRITICAL: Ensure readOnly property exists on all pools
    ensureReadOnlyProperty() {
        let needsSave = false;

        Object.values(this.pools).forEach(pool => {
            if (!pool.hasOwnProperty('readOnly')) {
                console.warn(`⚠️ Pool ${pool.name} missing readOnly property, adding default`);
                pool.readOnly = false;
                needsSave = true;
            }
        });

        if (needsSave) {
            console.log('💾 Saving pools with readOnly properties');
            this.saveToStorage();
        }
    }

}