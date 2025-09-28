import PoolManager from './core/poolManager.js';
import UserManager from './core/userManager.js';
import { PermissionManager } from './core/permissions.js';

export default class VesselManager {
    constructor() {
        this.vessels = [];
        this.storageKey = 'fueleu_vessels';

        // Initialize the new managers
        this.poolManager = new PoolManager();
        this.userManager = new UserManager();
        this.permissions = PermissionManager;

        console.log('🚢 VesselManager constructor called');

        this.loadFromStorage();
        console.log('💾 After loadFromStorage:', this.vessels.length);

        // If no stored data, load sample data
        if (this.vessels.length === 0) {
            console.log('📦 Loading sample data...');
            this.loadSampleData();
            console.log('✅ Sample data loaded:', this.vessels.length);
        }

        // Update pool vessel counts after loading
        this.updateAllPoolVesselCounts();
    }

    loadSampleData() {
        this.vessels = [
            {
                id: 1,
                name: "Atlantic Explorer",
                imo: "1234567",
                type: "container",
                fuelConsumption: 45000,
                ghgIntensity: 89.25,
                status: "compliant",
                owner: "user1",
                pool: "Pool A",
                dateAdded: new Date('2024-01-15').toISOString(),
                lastUpdated: new Date().toISOString()
            },
            {
                id: 2,
                name: "Nordic Carrier",
                imo: "2345678",
                type: "bulk",
                fuelConsumption: 32000,
                ghgIntensity: 93.85,
                status: "at-risk",
                owner: "user1",
                pool: "Pool A",
                dateAdded: new Date('2024-02-20').toISOString(),
                lastUpdated: new Date().toISOString()
            },
            {
                id: 3,
                name: "Med Princess",
                imo: "3456789",
                type: "passenger",
                fuelConsumption: 28000,
                ghgIntensity: 95.12,
                status: "non-compliant",
                owner: "user2",
                pool: "Pool B",
                dateAdded: new Date('2024-03-10').toISOString(),
                lastUpdated: new Date().toISOString()
            },
            {
                id: 4,
                name: "Pacific Trader",
                imo: "4567890",
                type: "container",
                fuelConsumption: 52000,
                ghgIntensity: 87.55,
                status: "compliant",
                owner: "user2",
                pool: "Pool B",
                dateAdded: new Date('2024-01-25').toISOString(),
                lastUpdated: new Date().toISOString()
            },
            {
                id: 5,
                name: "Baltic Voyager",
                imo: "5678901",
                type: "tanker",
                fuelConsumption: 38000,
                ghgIntensity: 91.28,
                status: "at-risk",
                owner: "admin",
                pool: "Pool A",
                dateAdded: new Date('2024-02-15').toISOString(),
                lastUpdated: new Date().toISOString()
            }
        ];
        this.saveToStorage();
    }

    // Persistence methods
    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.vessels));
        } catch (error) {
            console.warn('Could not save vessels to localStorage:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.vessels = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Could not load vessels from localStorage:', error);
            this.vessels = [];
        }
    }

    // Enhanced addVessel with pool and permission integration
    addVessel(vesselData, currentUser = null) {
        // Permission check
        if (currentUser && !this.permissions.canCreateVessel(currentUser)) {
            throw new Error('You do not have permission to create vessels');
        }

        // Enhanced validation with pool and owner requirements
        const requiredFields = ['name', 'imo', 'type', 'fuelConsumption', 'ghgIntensity'];

        // Add pool and owner requirements based on user role
        if (currentUser) {
            if (currentUser.role === 'admin') {
                requiredFields.push('pool', 'owner');
            } else {
                // Users must specify pool, owner is set to current user
                requiredFields.push('pool');
                vesselData.owner = currentUser.id;
            }
        }

        const missingFields = requiredFields.filter(field => !vesselData[field]);
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate pool exists
        if (!this.poolManager.poolExists(vesselData.pool)) {
            throw new Error(`Pool "${vesselData.pool}" does not exist`);
        }

        // Check if user can add vessels to this pool
        if (currentUser && currentUser.role !== 'admin') {
            if (!currentUser.pools.includes(vesselData.pool)) {
                throw new Error(`You don't have access to pool "${vesselData.pool}"`);
            }
        }

        // Validate owner exists (for admin assignments)
        if (vesselData.owner) {
            const owner = this.userManager.getUser(vesselData.owner);
            if (!owner) {
                throw new Error(`User "${vesselData.owner}" does not exist`);
            }

            // Check if owner has access to the pool
            if (!this.userManager.canUserAccessPool(vesselData.owner, vesselData.pool)) {
                throw new Error(`User "${vesselData.owner}" doesn't have access to pool "${vesselData.pool}"`);
            }
        }

        // Existing validations
        if (this.vessels.some(v => v.imo === vesselData.imo)) {
            throw new Error(`Vessel with IMO ${vesselData.imo} already exists`);
        }

        if (!/^\d{7}$/.test(vesselData.imo)) {
            throw new Error('IMO number must be exactly 7 digits');
        }

        if (vesselData.fuelConsumption <= 0) {
            throw new Error('Fuel consumption must be greater than 0');
        }

        if (vesselData.ghgIntensity <= 0) {
            throw new Error('GHG intensity must be greater than 0');
        }

        const vessel = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            ...vesselData,
            status: 'pending',
            dateAdded: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        this.vessels.push(vessel);
        this.saveToStorage();

        // Update pool vessel count
        this.updatePoolVesselCount(vesselData.pool);

        console.log('Vessel added:', vessel);
        return vessel;
    }

    // Enhanced removeVessel with permission checks
    removeVessel(vesselId, currentUser = null) {
        const vessel = this.getVessel(vesselId);
        if (!vessel) {
            throw new Error('Vessel not found');
        }

        // Permission check
        if (currentUser && !this.permissions.canDeleteVessel(currentUser)) {
            throw new Error('You do not have permission to delete vessels');
        }

        const initialLength = this.vessels.length;
        const vesselPool = vessel.pool;

        this.vessels = this.vessels.filter(v => v.id !== vesselId);

        if (this.vessels.length === initialLength) {
            throw new Error('Vessel not found');
        }

        this.saveToStorage();

        // Update pool vessel count
        if (vesselPool) {
            this.updatePoolVesselCount(vesselPool);
        }

        return true;
    }

    // New pool-related methods
    getVesselsByPool(poolName) {
        return this.vessels.filter(vessel => vessel.pool === poolName);
    }

    getVesselsByOwner(ownerId) {
        return this.vessels.filter(vessel => vessel.owner === ownerId);
    }

    getVesselsByUserAccess(user) {
        if (user.role === 'admin') {
            return this.getAllVessels();
        }

        return this.vessels.filter(vessel =>
            user.pools.includes(vessel.pool)
        );
    }

    getEditableVesselsByUser(user) {
        if (user.role === 'admin') {
            return this.getAllVessels();
        }

        return this.vessels.filter(vessel =>
            vessel.owner === user.id
        );
    }

    // Pool vessel count management
    updatePoolVesselCount(poolName) {
        const vesselCount = this.getVesselsByPool(poolName).length;
        this.poolManager.updateVesselCount(poolName, vesselCount);
    }

    updateAllPoolVesselCounts() {
        const pools = this.poolManager.getAllPools();
        pools.forEach(pool => {
            this.updatePoolVesselCount(pool.name);
        });
    }

    getVessel(vesselId) {
        return this.vessels.find(v => v.id === vesselId);
    }

    getAllVessels() {
        return [...this.vessels];
    }

    // Enhanced updateVessel with permission checks
    updateVessel(vesselId, updates, currentUser = null) {
        const vessel = this.getVessel(vesselId);
        if (!vessel) {
            throw new Error('Vessel not found');
        }

        // Permission check
        if (currentUser && !this.permissions.canEditVessel(currentUser, vessel)) {
            throw new Error('You do not have permission to edit this vessel');
        }

        // If pool is being changed, validate new pool
        if (updates.pool && updates.pool !== vessel.pool) {
            if (!this.poolManager.poolExists(updates.pool)) {
                throw new Error(`Pool "${updates.pool}" does not exist`);
            }

            // Check if current user can move vessel to new pool
            if (currentUser && currentUser.role !== 'admin') {
                if (!currentUser.pools.includes(updates.pool)) {
                    throw new Error(`You don't have access to pool "${updates.pool}"`);
                }
            }
        }

        // If owner is being changed, validate new owner
        if (updates.owner && updates.owner !== vessel.owner) {
            if (currentUser && currentUser.role !== 'admin') {
                throw new Error('Only administrators can change vessel ownership');
            }

            const newOwner = this.userManager.getUser(updates.owner);
            if (!newOwner) {
                throw new Error(`User "${updates.owner}" does not exist`);
            }

            // Check if new owner has access to vessel's pool
            const targetPool = updates.pool || vessel.pool;
            if (!this.userManager.canUserAccessPool(updates.owner, targetPool)) {
                throw new Error(`User "${updates.owner}" doesn't have access to pool "${targetPool}"`);
            }
        }

        // Existing validation logic for IMO, fuel consumption, etc.
        if (updates.imo && updates.imo !== vessel.imo) {
            if (this.vessels.some(v => v.id !== vesselId && v.imo === updates.imo)) {
                throw new Error(`Vessel with IMO ${updates.imo} already exists`);
            }
            if (!/^\d{7}$/.test(updates.imo)) {
                throw new Error('IMO number must be exactly 7 digits');
            }
        }

        if (updates.fuelConsumption && updates.fuelConsumption <= 0) {
            throw new Error('Fuel consumption must be greater than 0');
        }

        if (updates.ghgIntensity && updates.ghgIntensity <= 0) {
            throw new Error('GHG intensity must be greater than 0');
        }

        const oldPool = vessel.pool;

        // Apply updates
        Object.assign(vessel, updates, {
            lastUpdated: new Date().toISOString()
        });

        this.saveToStorage();

        // Update pool vessel counts if pool changed
        if (updates.pool && updates.pool !== oldPool) {
            this.updatePoolVesselCount(oldPool);
            this.updatePoolVesselCount(updates.pool);
        }

        return vessel;
    }

    // Validate edited vessel
    validateVesselForEdit(vesselId, vesselData) {
        const errors = [];

        if (!vesselData.name || vesselData.name.trim().length === 0) {
            errors.push('Vessel name is required');
        }

        if (!vesselData.imo || !/^\d{7}$/.test(vesselData.imo)) {
            errors.push('IMO number must be exactly 7 digits');
        }

        // Check IMO uniqueness (excluding current vessel)
        if (vesselData.imo && this.vessels.some(v => v.id !== vesselId && v.imo === vesselData.imo)) {
            errors.push('Another vessel with this IMO number already exists');
        }

        if (!VesselManager.getValidVesselTypes().includes(vesselData.type)) {
            errors.push(`Invalid vessel type. Must be one of: ${VesselManager.getValidVesselTypes().join(', ')}`);
        }

        if (!vesselData.fuelConsumption || vesselData.fuelConsumption <= 0) {
            errors.push('FuelEU energy used must be a positive number');
        }

        if (!vesselData.ghgIntensity || vesselData.ghgIntensity <= 0) {
            errors.push('GHG intensity must be a positive number');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Enhanced search with pool filtering
    searchVessels(query, user = null) {
        if (!query) {
            return user ? this.getVesselsByUserAccess(user) : this.getAllVessels();
        }

        const lowerQuery = query.toLowerCase().trim();
        let searchResults = this.vessels.filter(vessel =>
            vessel.name.toLowerCase().includes(lowerQuery) ||
            vessel.imo.includes(lowerQuery) ||
            vessel.type.toLowerCase().includes(lowerQuery)
        );

        // Filter by user access
        if (user) {
            searchResults = searchResults.filter(vessel =>
                this.permissions.canViewVessel(user, vessel)
            );
        }

        console.log(`Search for "${query}" returned ${searchResults.length} results`);
        return searchResults;
    }

    // Enhanced analytics with pool breakdown
    getVesselStats(user = null) {
        const vessels = user ? this.getVesselsByUserAccess(user) : this.vessels;

        const stats = {
            total: vessels.length,
            byType: {},
            byStatus: {},
            byPool: {},
            byOwner: {},
            totalFuelConsumption: 0,
            averageGHGIntensity: 0
        };

        vessels.forEach(vessel => {
            // Count by type
            stats.byType[vessel.type] = (stats.byType[vessel.type] || 0) + 1;

            // Count by status
            stats.byStatus[vessel.status] = (stats.byStatus[vessel.status] || 0) + 1;

            // Count by pool
            stats.byPool[vessel.pool] = (stats.byPool[vessel.pool] || 0) + 1;

            // Count by owner
            stats.byOwner[vessel.owner] = (stats.byOwner[vessel.owner] || 0) + 1;

            // Sum fuel consumption
            stats.totalFuelConsumption += vessel.fuelConsumption;

            // Sum GHG intensity for average calculation
            stats.averageGHGIntensity += vessel.ghgIntensity;
        });

        // Calculate average GHG intensity
        if (vessels.length > 0) {
            stats.averageGHGIntensity = stats.averageGHGIntensity / vessels.length;
        }

        return stats;
    }

    // Pool management integration
    moveVesselToPool(vesselId, newPoolName, currentUser = null) {
        return this.updateVessel(vesselId, { pool: newPoolName }, currentUser);
    }

    assignVesselToOwner(vesselId, newOwner, currentUser = null) {
        return this.updateVessel(vesselId, { owner: newOwner }, currentUser);
    }

    // Bulk operations with pool support
    bulkMoveToPool(vesselIds, poolName, currentUser = null) {
        let moved = 0;
        const errors = [];

        vesselIds.forEach(id => {
            try {
                this.moveVesselToPool(id, poolName, currentUser);
                moved++;
            } catch (error) {
                errors.push(`Vessel ${id}: ${error.message}`);
            }
        });

        return { moved, errors };
    }

    bulkAssignToOwner(vesselIds, ownerId, currentUser = null) {
        let assigned = 0;
        const errors = [];

        vesselIds.forEach(id => {
            try {
                this.assignVesselToOwner(id, ownerId, currentUser);
                assigned++;
            } catch (error) {
                errors.push(`Vessel ${id}: ${error.message}`);
            }
        });

        return { assigned, errors };
    }

    // Get available pools and owners for dropdowns
    getAvailablePoolsForUser(user) {
        return this.poolManager.getPoolsForUser(user.role, user.pools);
    }

    getAvailableOwnersForPool(poolName) {
        const allUsers = this.userManager.getAllUsers();
        return this.permissions.getAvailableUsersForPool(allUsers, poolName);
    }

    // Data import/export methods
    exportToJSON() {
        const exportData = {
            vessels: this.vessels,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

        const exportFileDefaultName = `fueleu_vessels_${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.style.visibility = 'hidden';
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
    }

    importFromJSON(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

            if (!data.vessels || !Array.isArray(data.vessels)) {
                throw new Error('Invalid JSON format: vessels array not found');
            }

            // Validate each vessel
            const validatedVessels = data.vessels.map((vessel, index) => {
                const requiredFields = ['name', 'imo', 'type', 'fuelConsumption', 'ghgIntensity'];
                const missingFields = requiredFields.filter(field => !vessel[field]);

                if (missingFields.length > 0) {
                    throw new Error(`Vessel ${index + 1}: Missing fields: ${missingFields.join(', ')}`);
                }

                return {
                    ...vessel,
                    id: Date.now() + Math.random() + index,
                    dateAdded: vessel.dateAdded || new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    status: vessel.status || 'pending'
                };
            });

            // Replace current vessels
            this.vessels = validatedVessels;
            this.saveToStorage();

            return {
                success: true,
                imported: validatedVessels.length,
                message: `Successfully imported ${validatedVessels.length} vessels`
            };

        } catch (error) {
            throw new Error(`Import failed: ${error.message}`);
        }
    }

    // Bulk operations
    bulkUpdateStatus(vesselIds, newStatus) {
        let updated = 0;
        vesselIds.forEach(id => {
            const vessel = this.getVessel(id);
            if (vessel) {
                vessel.status = newStatus;
                vessel.lastUpdated = new Date().toISOString();
                updated++;
            }
        });

        if (updated > 0) {
            this.saveToStorage();
        }

        return updated;
    }

    bulkDelete(vesselIds) {
        const initialLength = this.vessels.length;
        this.vessels = this.vessels.filter(v => !vesselIds.includes(v.id));
        const deleted = initialLength - this.vessels.length;

        if (deleted > 0) {
            this.saveToStorage();
        }

        return deleted;
    }

    // Clear all data
    clearAllVessels() {
        this.vessels = [];
        this.saveToStorage();
    }

    // Validation helpers
    static getValidVesselTypes() {
        return ['container', 'bulk', 'tanker', 'passenger', 'ro-ro', 'general', 'other'];
    }

    static getValidStatuses() {
        return ['compliant', 'non-compliant', 'pending'];
    }

    // Enhanced validation
    validateVessel(vesselData, currentUser = null) {
        const errors = [];

        if (!vesselData.name || vesselData.name.trim().length === 0) {
            errors.push('Vessel name is required');
        }

        if (!vesselData.imo || !/^\d{7}$/.test(vesselData.imo)) {
            errors.push('IMO number must be exactly 7 digits');
        }

        if (!VesselManager.getValidVesselTypes().includes(vesselData.type)) {
            errors.push(`Invalid vessel type. Must be one of: ${VesselManager.getValidVesselTypes().join(', ')}`);
        }

        if (!vesselData.fuelConsumption || vesselData.fuelConsumption <= 0) {
            errors.push('Fuel consumption must be a positive number');
        }

        if (!vesselData.ghgIntensity || vesselData.ghgIntensity <= 0) {
            errors.push('GHG intensity must be a positive number');
        }

        // Pool validation
        if (!vesselData.pool) {
            errors.push('Pool assignment is required');
        } else if (!this.poolManager.poolExists(vesselData.pool)) {
            errors.push(`Pool "${vesselData.pool}" does not exist`);
        }

        // Owner validation
        if (!vesselData.owner) {
            errors.push('Owner assignment is required');
        } else {
            const owner = this.userManager.getUser(vesselData.owner);
            if (!owner) {
                errors.push(`Owner "${vesselData.owner}" does not exist`);
            } else if (vesselData.pool && !this.userManager.canUserAccessPool(vesselData.owner, vesselData.pool)) {
                errors.push(`Owner "${vesselData.owner}" doesn't have access to pool "${vesselData.pool}"`);
            }
        }

        // User-specific validations
        if (currentUser && currentUser.role !== 'admin') {
            if (vesselData.pool && !currentUser.pools.includes(vesselData.pool)) {
                errors.push(`You don't have access to pool "${vesselData.pool}"`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}