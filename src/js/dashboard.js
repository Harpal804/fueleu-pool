import PoolManager from './core/poolManager.js';
import UserManager from './core/userManager.js';
import { PermissionManager } from './core/permissions.js';

export default class Dashboard {
    constructor(vesselManager, complianceCalculator) {
        this.vesselManager = vesselManager;
        this.calculator = complianceCalculator;
        this.poolManager = new PoolManager();
        this.userManager = new UserManager();
        this.permissions = PermissionManager;
        this.currentYear = 2025;
        this.currentView = 'vessels';
        this.selectedVessels = new Set();
        this.authManager = null;
        this.currentPool = null; // Track currently selected pool

        window.dashboard = this;
    }

    // Add pool management methods
    refreshPoolList() {
        // Force reload from storage
        this.poolManager.loadFromStorage();
        this.displayPoolManagement();

        // Regenerate pool tabs to reflect any changes
        setTimeout(() => {
            this.generatePoolTabs();
        }, 100);

        this.showNotification('Pool data refreshed and tabs updated!', 'success');
    }

    displayPoolManagement() {
        const container = document.getElementById('poolManagementList');
        if (!container) {
            console.warn('Pool management container not found');
            return;
        }

        const pools = this.poolManager.getAllPools();

        let html = `
            <div class="pools-management-table">
                <table>
                    <thead>
                        <tr>
                            <th>Pool Name</th>
                            <th>Description</th>
                            <th>Vessels</th>
                            <th>Manager</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        pools.forEach(pool => {
            const vesselCount = this.vesselManager.getVesselsByPool(pool.name).length;
            const createdDate = new Date(pool.created).toLocaleDateString();

            html += `
                <tr>
                    <td class="pool-name">${pool.name}</td>
                    <td class="pool-description">${pool.description || 'No description'}</td>
                    <td class="vessel-count">${vesselCount}</td>
                    <td>${pool.manager}</td>
                    <td>${createdDate}</td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="dashboard.editPool('${pool.name}')" title="Edit Pool">
                                <span>✏️</span>
                            </button>
                            <button class="btn-icon danger" onclick="dashboard.deletePool('${pool.name}')" title="Delete Pool">
                                <span>🗑️</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    }

    showCreatePoolModal() {
        this.resetPoolModal();
        document.getElementById('poolModalTitle').textContent = 'Create New Pool';
        document.getElementById('poolModalSubmit').textContent = 'Create Pool';
        document.getElementById('poolModalSubmit').onclick = () => this.createPool();
        document.getElementById('poolModal').style.display = 'block';
    }

    editPool(poolName) {
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (!this.permissions.canCreatePool(currentUser)) {
            alert('You do not have permission to edit pools.');
            return;
        }

        const pool = this.poolManager.getPool(poolName);
        if (!pool) {
            alert('Pool not found.');
            return;
        }

        // Populate form with existing data
        document.getElementById('poolName').value = pool.name;
        document.getElementById('poolDescription').value = pool.description || '';
        document.getElementById('poolManager').value = pool.manager;

        // Update modal for edit mode
        document.getElementById('poolModalTitle').textContent = 'Edit Pool';
        document.getElementById('poolModalSubmit').textContent = 'Update Pool';
        document.getElementById('poolModalSubmit').onclick = () => this.updatePool(poolName);

        document.getElementById('poolModal').style.display = 'block';
    }

    submitPoolForm() {
        // This will be overridden by the onclick handlers
    }

    createPool() {
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (!this.permissions.canCreatePool(currentUser)) {
            alert('You do not have permission to create pools.');
            return;
        }

        const name = document.getElementById('poolName').value.trim();
        const description = document.getElementById('poolDescription').value.trim();
        const manager = document.getElementById('poolManager').value;

        if (!name) {
            alert('Pool name is required');
            return;
        }

        try {
            this.poolManager.createPool({ name, description, manager });
            this.syncAdminPools();
            this.updatePoolLists();
            this.displayPoolManagement();
            this.closePoolModal();
            this.showNotification(`Pool "${name}" created successfully!`, 'success');
        } catch (error) {
            alert(`Error creating pool: ${error.message}`);
        }
    }

    updatePool(originalPoolName) {
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (!this.permissions.canCreatePool(currentUser)) {
            alert('You do not have permission to edit pools.');
            return;
        }

        const name = document.getElementById('poolName').value.trim();
        const description = document.getElementById('poolDescription').value.trim();
        const manager = document.getElementById('poolManager').value;

        if (!name) {
            alert('Pool name is required');
            return;
        }

        try {
            // If pool name changed, we need to update vessel assignments
            if (name !== originalPoolName) {
                // Update all vessels in this pool
                const vessels = this.vesselManager.getVesselsByPool(originalPoolName);
                vessels.forEach(vessel => {
                    this.vesselManager.updateVessel(vessel.id, { pool: name }, currentUser);
                });
            }

            this.poolManager.updatePool(originalPoolName, { name, description, manager });

            // If name changed, delete old pool and create new one
            if (name !== originalPoolName) {
                this.poolManager.deletePool(originalPoolName);
            }

            this.updatePoolLists();
            this.displayPoolManagement();
            this.closePoolModal();
            this.showNotification(`Pool "${name}" updated successfully!`, 'success');
        } catch (error) {
            alert(`Error updating pool: ${error.message}`);
        }
    }

    deletePool(poolName) {
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (!this.permissions.canDeletePool(currentUser)) {
            alert('You do not have permission to delete pools.');
            return;
        }

        const pool = this.poolManager.getPool(poolName);
        if (!pool) {
            alert('Pool not found.');
            return;
        }

        // Check if pool has vessels
        const vesselCount = this.vesselManager.getVesselsByPool(poolName).length;
        if (vesselCount > 0) {
            if (!confirm(`Pool "${poolName}" contains ${vesselCount} vessels. Deleting the pool will remove all vessels from the pool. Are you sure?`)) {
                return;
            }
        } else {
            if (!confirm(`Are you sure you want to delete pool "${poolName}"? This action cannot be undone.`)) {
                return;
            }
        }

        try {
            // Remove all vessels from this pool first
            const vessels = this.vesselManager.getVesselsByPool(poolName);
            vessels.forEach(vessel => {
                this.vesselManager.removeVessel(vessel.id, currentUser);
            });

            this.poolManager.deletePool(poolName);
            this.syncAdminPools();
            this.updatePoolLists();
            this.displayPoolManagement();
            const activeTab = document.querySelector('.pool-tab-content.active');
            if (activeTab && activeTab.id === 'management') {
                // We're on management tab, just refresh the pool list (already done above)
            } else {
                // We might be on a deleted pool tab, regenerate all tabs
                setTimeout(() => {
                    this.generatePoolTabs();
                }, 100);
            }
            this.showNotification(`Pool "${poolName}" deleted successfully!`, 'success');
        } catch (error) {
            alert(`Error deleting pool: ${error.message}`);
        }
    }

    resetPoolModal() {
        document.getElementById('poolName').value = '';
        document.getElementById('poolDescription').value = '';
        document.getElementById('poolManager').value = 'admin';
    }

    closePoolModal() {
        document.getElementById('poolModal').style.display = 'none';
        this.resetPoolModal();
    }

    init() {
        this.createHTML();
        this.bindEvents();

        // update interface for user (after HTML exists)
        if (this.authManager) {
            this.updateInterfaceForUser();
        }

        // Ensure vessels load immediately
        // this.updateDisplay();

        console.log('✅ Dashboard initialized successfully');
    }

    setAuthContext(authManager) {
        this.authManager = authManager;
        console.log('🔐 Auth context set for user:', authManager.currentUser);
    }

    updateInterfaceForUser() {
        if (!this.authManager) return;

        const isAdmin = this.authManager.userRole === 'admin';
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        console.log('👤 Updating interface for role:', this.authManager.userRole);

        // Show/hide admin-only features (pools and user management)
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? 'block' : 'none';
        });

        // Show/hide vessel creation section based on permissions
        const addVesselSection = document.getElementById('addVesselSection');
        if (addVesselSection && currentUser) {
            const canCreateVessel = this.permissions.canCreateVessel(currentUser);
            addVesselSection.style.display = canCreateVessel ? 'block' : 'none';
        }

        // Update user info in header
        this.updateUserInfoDisplay();
        this.updatePoolLists();

        // Generate dynamic pool tabs
        setTimeout(() => {
            this.generatePoolTabs();

            // Ensure admin-only elements are properly shown/hidden after tab generation
            const isAdmin = this.authManager.userRole === 'admin';
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = isAdmin ? 'table-cell' : 'none'; // Use table-cell for table columns
            });

            // Ensure admin pools are synced on startup
            if (isAdmin) {
                this.syncAdminPools();
            }
        }, 300);

    }

    updateUserInfoDisplay() {
        // Wait a bit for DOM to be ready
        setTimeout(() => {
            const header = document.querySelector('.header');
            if (!header) {
                console.warn('Header not found, skipping user info display');
                return;
            }

            let userInfo = document.getElementById('userInfo');

            if (!userInfo) {
                userInfo = document.createElement('div');
                userInfo.id = 'userInfo';
                userInfo.className = 'user-info';
                userInfo.innerHTML = `
                    <div class="user-details">
                        <span id="currentUser">${this.authManager.currentUser}</span>
                         <span id="currentUserRole">(${this.authManager.userRole})</span>
                        <span id="currentPool">${this.authManager.selectedPool ? ` - ${this.authManager.selectedPool}` : ''}</span>
                    </div>
                    <button class="logout-btn" onclick="authManager.logout()">Logout</button>
                `;
                header.appendChild(userInfo);
            }
        }, 100);
    }

    // filterVesselsForUser() {
    //     if (!this.authManager) return;

    //     if (this.authManager.userRole === 'admin') {
    //         // Admin sees all vessels
    //         console.log('👑 Admin user - showing all vessels');
    //         return; // No filtering needed
    //     } else {
    //         // Users see only their pool's vessels when a pool is selected
    //         if (this.authManager.selectedPool) {
    //             console.log('👤 User filtered to pool:', this.authManager.selectedPool);
    //             // The filtering will be handled in updateDisplay() method
    //         }
    //     }

    //     // Refresh display with new filter
    //     this.updateDisplay();
    // }

    createHTML() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="container">
                <div class="header">
                    <h1>🚢 FuelEU Maritime Compliance Pool</h1>
                    <p>Advanced vessel compliance management for FuelEU Maritime regulation</p>
                </div>

                <div class="tabs" id="dynamicTabs">
                    <!-- Tabs will be generated dynamically based on user pools -->
                </div>
            </div>

            <!-- Modal for vessel details -->
            <div id="vesselModal" class="modal">
                <div class="modal-content">
                    <span class="close" onclick="dashboard.closeModal()">&times;</span>
                    <div id="modalContent"></div>
                </div>
            </div>

            <!-- Modal for Pool details -->
            <div id="poolModal" class="modal">
                <div class="modal-content">
                    <span class="close" onclick="dashboard.closePoolModal()">&times;</span>
                    <h2 id="poolModalTitle">Create New Pool</h2>
                    <div class="pool-form">
                        <div class="form-group">
                            <label for="poolName">Pool Name:</label>
                            <input type="text" id="poolName" required placeholder="Enter pool name">
                        </div>
                        <div class="form-group">
                            <label for="poolDescription">Description:</label>
                            <textarea id="poolDescription" rows="3" placeholder="Enter pool description"></textarea>
                        </div>
                        <div class="form-group">
                            <label for="poolManager">Pool Manager:</label>
                            <select id="poolManager">
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-primary" id="poolModalSubmit" onclick="dashboard.submitPoolForm()">Create Pool</button>
                            <button class="btn btn-secondary" onclick="dashboard.closePoolModal()">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- User Management Modal -->
            <div id="userModal" class="modal">
                <div class="modal-content">
                    <span class="close" onclick="dashboard.closeUserModal()">&times;</span>
                    <h2 id="userModalTitle">Create New User</h2>
                    <div class="user-form">
                        <div class="form-group">
                            <label for="userId">User ID:</label>
                            <input type="text" id="userId" required placeholder="Enter user ID (e.g., user3)">
                        </div>
                        <div class="form-group">
                            <label for="userName">Display Name:</label>
                            <input type="text" id="userName" required placeholder="Enter display name">
                        </div>
                        <div class="form-group">
                            <label for="userRole">Role:</label>
                            <select id="userRole">
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="userPassword">Password:</label>
                            <input type="password" id="userPassword" required placeholder="Enter password">
                        </div>
                        <div class="form-group">
                            <label>Pool Access:</label>
                            <div id="userPoolAccess" class="checkbox-group">
                                <!-- Pool checkboxes will be populated here -->
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-primary" id="userModalSubmit" onclick="dashboard.submitUserForm()">Create User</button>
                            <button class="btn btn-secondary" onclick="dashboard.closeUserModal()">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Hidden file input for data import -->
            <input type="file" id="fileInput" accept=".json,.csv" style="display: none;">
        `;
    }

    bindEvents() {
        // Form submission
        // No need for form submission binding since we're using button onclick
        // The form elements are now individual inputs in the table

        // Search input (now in header)
        const searchVessels = document.getElementById('searchVessels');
        if (searchVessels) {
            searchVessels.addEventListener('input', () => {
                this.updateDisplay();
            });
        }

        // File input for import
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileImport(e.target.files[0]);
            });
        }

        // Modal click outside to close
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('vesselModal');
            if (event.target === modal) {
                this.closeModal();
            }
        });

        // Bulk actions
        const bulkActionsBtn = document.getElementById('bulkActionsBtn');
        if (bulkActionsBtn) {
            bulkActionsBtn.addEventListener('click', () => {
                this.showBulkActions();
            });

            // Bind fleet controls after DOM is ready
            this.bindFleetControls();
        }
    }

    bindFleetControls() {
        // Use setTimeout to ensure elements are in DOM
        setTimeout(() => {
            console.log('🔧 Binding fleet controls...');

            // Pool filter change
            const poolFilter = document.getElementById('poolFilter');
            if (poolFilter) {
                console.log('✅ Pool filter element found, binding event');
                poolFilter.addEventListener('change', (e) => {
                    console.log('🏊 Pool filter changed to:', e.target.value);
                    this.currentPool = e.target.value;
                    this.updateDisplay();
                });
            }

            // Filter change
            const vesselFilter = document.getElementById('vesselFilter');
            if (vesselFilter) {
                console.log('✅ Filter element found, binding event');
                vesselFilter.addEventListener('change', (e) => {
                    console.log('📋 Filter changed to:', e.target.value);
                    this.updateDisplay();
                });
            } else {
                console.error('❌ vesselFilter element not found during binding');
            }

            // Search input
            const searchVessels = document.getElementById('searchVessels');
            if (searchVessels) {
                console.log('✅ Search element found, binding event');
                searchVessels.addEventListener('input', (e) => {
                    console.log('🔍 Search changed to:', e.target.value);
                    this.updateDisplay();
                });
            } else {
                console.error('❌ searchVessels element not found during binding');
            }

            // Bulk actions
            const bulkActionsBtn = document.getElementById('bulkActionsBtn');
            if (bulkActionsBtn) {
                console.log('✅ Bulk actions button found, binding event');
                bulkActionsBtn.addEventListener('click', () => {
                    this.showBulkActions();
                });
            } else {
                console.error('❌ bulkActionsBtn element not found during binding');
            }

        }, 100); // Small delay to ensure DOM is ready
    }

    updatePoolLists() {
        // Update pool dropdown in vessel form
        const poolSelect = document.getElementById('vesselPool');
        if (poolSelect && this.authManager) {
            const user = this.userManager.getUser(this.authManager.currentUser);
            const availablePools = this.poolManager.getPoolsForUser(user.role, user.pools);

            poolSelect.innerHTML = '<option value="">Select Pool</option>';
            availablePools.forEach(pool => {
                const option = document.createElement('option');
                option.value = pool.name;
                option.textContent = pool.name;
                poolSelect.appendChild(option);
            });
        }

        // Update pool filter dropdown
        const poolFilter = document.getElementById('poolFilter');
        if (poolFilter && this.authManager) {
            const user = this.userManager.getUser(this.authManager.currentUser);
            const availablePools = user.role === 'admin'
                ? this.poolManager.getAllPools()
                : this.poolManager.getPoolsForUser(user.role, user.pools);

            poolFilter.innerHTML = '<option value="">All Pools</option>';
            availablePools.forEach(pool => {
                const option = document.createElement('option');
                option.value = pool.name;
                option.textContent = pool.name;
                poolFilter.appendChild(option);
            });
        }

        // Owner dropdown population
        const ownerSelect = document.getElementById('vesselOwner');
        if (ownerSelect && this.authManager) {
            const allUsers = this.userManager.getAllUsers();
            ownerSelect.innerHTML = '<option value="">Select Owner</option>';
            allUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.name || user.id;
                ownerSelect.appendChild(option);
            });
        }

        // Update admin pool selector if it exists
        const adminPoolSelect = document.getElementById('adminPoolSelect');
        if (adminPoolSelect) {
            const allPools = this.poolManager.getAllPools();
            adminPoolSelect.innerHTML = '<option value="">Select Pool to Manage</option>';
            allPools.forEach(pool => {
                const option = document.createElement('option');
                option.value = pool.name;
                option.textContent = pool.name;
                adminPoolSelect.appendChild(option);
            });
        }
    }

    addVessel() {
        // Get current user from UserManager
        const currentUser = this.authManager ? this.userManager.getUser(this.authManager.currentUser) : null;

        // Permission check using new permission system
        if (currentUser && !this.permissions.canCreateVessel(currentUser)) {
            alert('You do not have permission to create vessels.');
            return;
        }

        try {
            const vesselData = {
                name: document.getElementById('vesselName').value.trim(),
                imo: document.getElementById('imoNumber').value.trim(),
                type: document.getElementById('vesselType').value,
                fuelConsumption: parseFloat(document.getElementById('fuelConsumption').value),
                ghgIntensity: parseFloat(document.getElementById('ghgIntensity').value)
            };

            // Add pool and owner - these fields are missing in your form
            if (currentUser) {
                if (currentUser.role === 'admin') {
                    // Admin should select pool and owner from dropdowns
                    vesselData.pool = document.getElementById('vesselPool').value;
                    const selectedOwner = document.getElementById('vesselOwner').value;
                    vesselData.owner = selectedOwner || currentUser.id; // Default to admin if no owner selected
                } else {
                    // Get user's pools from UserManager
                    const userPools = this.userManager.getUser(this.authManager.currentUser).pools;
                    vesselData.pool = userPools.length === 1 ? userPools[0] : document.getElementById('vesselPool').value;
                    vesselData.owner = currentUser.id;
                }
            }

            if (this.editingVesselId) {
                // Edit mode
                this.vesselManager.updateVessel(this.editingVesselId, vesselData, currentUser);
                this.showNotification(`Vessel "${vesselData.name}" updated successfully!`, 'success');
                this.exitEditMode();
            } else {
                // Add mode
                this.vesselManager.addVessel(vesselData, currentUser);
                this.showNotification(`Vessel "${vesselData.name}" added successfully!`, 'success');
            }

            this.updateDisplay();
            this.clearForm();

        } catch (error) {
            console.error('Error in addVessel:', error);
            alert(`Error ${this.editingVesselId ? 'updating' : 'adding'} vessel: ${error.message}`);
        }
    }

    clearForm() {
        document.getElementById('vesselName').value = '';
        document.getElementById('imoNumber').value = '';
        document.getElementById('vesselType').value = '';
        document.getElementById('fuelConsumption').value = '';
        document.getElementById('ghgIntensity').value = '';
        document.getElementById('vesselPool').value = '';
        document.getElementById('vesselOwner').value = '';

        // Exit edit mode if active
        if (this.editingVesselId) {
            this.exitEditMode();
        }
    }

    updateDisplay() {
        console.log('🔄 updateDisplay called');

        // Get all vessels first
        let vessels = this.vesselManager.getAllVessels();
        console.log('📊 Total vessels from manager:', vessels.length);
        console.log('📊 All vessels:', vessels.map(v => ({ name: v.name, pool: v.pool, owner: v.owner })));

        // Apply user access filtering first
        if (this.authManager && this.authManager.userRole !== 'admin') {
            console.log('👤 Current user:', this.authManager.currentUser);
            const user = this.userManager.getUser(this.authManager.currentUser);
            console.log('👤 User object:', user);
            console.log('👤 User pools:', user?.pools);

            vessels = vessels.filter(vessel => {
                const hasAccess = user && user.pools.includes(vessel.pool);
                console.log(`🔍 Vessel ${vessel.name} in pool ${vessel.pool} - User has access: ${hasAccess}`);
                return hasAccess;
            });
            console.log('👤 User access filtered vessels:', vessels.length);
            console.log('👤 Filtered vessel names:', vessels.map(v => v.name));
        }

        // Apply pool filter
        const poolFilterElement = document.getElementById('poolFilter');
        const selectedPool = poolFilterElement?.value || '';

        if (selectedPool) {
            vessels = vessels.filter(vessel => vessel.pool === selectedPool);
            console.log('🏊 Pool filtered vessels:', vessels.length);
        }

        // Update pool overview title
        this.updatePoolOverviewTitle(selectedPool, vessels);

        if (vessels.length === 0) {
            console.log('⚠️ No vessels found in vessel manager');
            // Still update with empty results
            const emptyCompliance = this.calculator.getEmptyPoolResult(this.currentYear);
            this.updateStats(emptyCompliance.summary);
            this.displayVessels([]);
            return;
        }

        // Debug: Check if filter elements exist
        const searchElement = document.getElementById('searchVessels');
        const filterElement = document.getElementById('vesselFilter');

        console.log('🔍 Search element found:', !!searchElement);
        console.log('📋 Filter element found:', !!filterElement);

        // Apply filters only if elements exist
        const searchQuery = searchElement?.value || '';
        const statusFilter = filterElement?.value || '';

        console.log('🔍 Search query:', searchQuery);
        console.log('📋 Status filter:', statusFilter);

        if (searchQuery) {
            vessels = this.vesselManager.searchVessels(searchQuery,
                this.authManager ? this.userManager.getUser(this.authManager.currentUser) : null)
                .filter(v => !selectedPool || v.pool === selectedPool);
            console.log('🔍 After search filter:', vessels.length);
        }

        // Handle case where search returns no results
        if (vessels.length === 0) {
            console.log('🔍 No vessels match search criteria');
            const emptyCompliance = this.calculator.getEmptyPoolResult(this.currentYear);
            this.updateStats(emptyCompliance.summary);
            this.displayVessels([]);

            // Update vessel count
            const vesselCountEl = document.getElementById('vesselCount');
            if (vesselCountEl) {
                vesselCountEl.textContent = '0 vessels shown';
            }
            return;
        }

        // Calculate compliance BEFORE status filter (status is set during compliance calculation)
        const compliance = this.calculator.calculatePoolCompliance(vessels, this.currentYear);
        console.log('⚖️ Vessels with compliance calculated:', compliance.vessels.length);

        // Debug: Check vessel statuses
        const statusCounts = {};
        compliance.vessels.forEach(v => {
            statusCounts[v.status] = (statusCounts[v.status] || 0) + 1;
        });
        console.log('📊 Vessel status counts:', statusCounts);

        // Apply status filter AFTER compliance calculation
        let filteredVessels = compliance.vessels;
        if (statusFilter) {
            filteredVessels = compliance.vessels.filter(v => v.status === statusFilter);
            console.log('📋 After status filter:', filteredVessels.length);
        }

        // Update displays
        this.updateStats(compliance.summary);
        this.displayVessels(filteredVessels);

        // Update vessel count
        const vesselCountEl = document.getElementById('vesselCount');
        if (vesselCountEl) {
            vesselCountEl.textContent = `${filteredVessels.length} vessels shown`;
        }

        // Update other tabs if they're visible
        if (this.currentView === 'compliance') {
            this.updateComplianceAnalysis(compliance);
        } else if (this.currentView === 'trends') {
            this.updateTrendsAnalysis();
        }
    }

    updateStats(summary) {
        // Provide default values if summary is undefined or incomplete
        if (!summary) {
            console.warn('⚠️ Summary is undefined, using default values');
            summary = {
                totalVessels: 0,
                compliantVessels: 0,
                poolComplianceBalance: 0,
                poolComplianceDeficit: 0,
                poolComplianceSurplus: 0,
                poolPotentialPenalty: 0
            };
        }

        document.getElementById('totalVessels').textContent = summary.totalVessels;
        document.getElementById('compliantVessels').textContent = summary.compliantVessels;

        // Net Compliance Balance with minus sign and styling
        const netBalance = summary.poolComplianceBalance;
        const netBalanceElement = document.getElementById('netComplianceBalance');

        netBalanceElement.textContent = `${netBalance.toFixed(2)}`;
        if (netBalance < 0) {
            netBalanceElement.className = 'stat-number deficit-value';
        } else {
            netBalanceElement.className = 'stat-number surplus-value';
        }

        // Pool deficit - sum of all vessel deficits
        const deficitElement = document.getElementById('poolDeficit');
        const deficitValue = Number(summary.poolComplianceDeficit);
        deficitElement.textContent = deficitValue > 0 ? `-${deficitValue.toFixed(2)}` : '0.00';
        if (deficitValue > 0) {
            deficitElement.className = 'stat-number deficit-value';
        } else {
            deficitElement.className = 'stat-number';
        }

        document.getElementById('poolSurplus').textContent = Number(summary.poolComplianceSurplus).toFixed(2);
    }

    displayVessels(vessels) {
        console.log('🖼️ displayVessels called with:', vessels.length, 'vessels');
        const container = document.getElementById('vesselsList');

        if (!container) {
            console.error('❌ vesselsList container not found!');
            return;
        }

        console.log('✅ Container found, displaying vessels...');

        // Create table structure
        let tableHtml = `
            <div class="vessels-table">
                <table>
                    <thead>
                        <tr>
                            <th class="select-col">
                                <input type="checkbox" id="selectAllTable" onchange="dashboard.toggleSelectAll()">
                            </th>
                            <th>Vessel Name</th>
                            <th>IMO</th>
                            <th>Type</th>
                            <th>Pool</th>
                            <th>Owner</th>
                            <th>FuelEU Energy (MJ)</th>
                            <th>GHG Intensity</th>
                            <th>Compliance Balance</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        vessels.forEach(vessel => {
            const isSelected = this.selectedVessels.has(vessel.id);
            const complianceBalanceText = vessel.complianceBalance < 0
                ? `${vessel.complianceBalance.toFixed(2)}`
                : `+${vessel.complianceBalance.toFixed(2)}`;

            tableHtml += `
                <tr class="${isSelected ? 'selected' : ''} ${vessel.status}">
                    <td class="select-col">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                            onchange="dashboard.toggleVesselSelection(${vessel.id})">
                    </td>
                    <td class="vessel-name">${vessel.name}</td>
                    <td>${vessel.imo}</td>
                    <td class="vessel-type">${vessel.type}</td>
                    <td class="pool-name">${vessel.pool || 'Unassigned'}</td>
                    <td class="owner-name">${this.getUserDisplayName(vessel.owner)}</td>
                    <td class="energy-value">${vessel.fuelConsumption.toLocaleString()}</td>
                    <td class="ghg-value">${vessel.ghgIntensity.toFixed(2)}</td>
                    <td class="compliance-value ${vessel.complianceBalance < 0 ? 'deficit' : 'surplus'}">${complianceBalanceText}</td>
                    <td>
                        <span class="status-badge ${vessel.status}">${vessel.status}</span>
                    </td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="dashboard.viewVesselDetails(${vessel.id})" title="Details">
                                <span>👁</span>
                            </button>
                            ${this.canUserEdit(vessel) ? `
                                <button class="btn-icon" onclick="dashboard.editVessel(${vessel.id})" title="Edit">
                                    <span>✏️</span>
                                </button>
                            ` : '<span class="no-permission">Read Only</span>'}
                            ${(() => {
                    const currentUser = this.userManager.getUser(this.authManager.currentUser);
                    return currentUser && (this.permissions.canDeleteVessel(currentUser) || vessel.owner === currentUser.id);
                })() ? `
                                <button class="btn-icon danger" onclick="dashboard.removeVessel(${vessel.id})" title="Remove">
                                    <span>🗑️</span>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHtml;

        // Update selected count
        document.getElementById('selectedCount').textContent = `${this.selectedVessels.size} selected`;

        // Update select all checkbox state
        const selectAllTable = document.getElementById('selectAllTable');
        if (selectAllTable) {
            selectAllTable.checked = this.selectedVessels.size === vessels.length && vessels.length > 0;
            selectAllTable.indeterminate = this.selectedVessels.size > 0 && this.selectedVessels.size < vessels.length;
        }
    }

    switchTab(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab content and mark tab as active
        document.getElementById(tabName).classList.add('active');

        // Find and activate the corresponding tab button
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            if (tab.textContent.toLowerCase().includes(tabName === 'reports' ? 'reports' : 'vessel')) {
                tab.classList.add('active');
            }
        });

        this.currentView = tabName;
    }

    // Vessel management methods
    viewVesselDetails(vesselId) {
        const vessel = this.vesselManager.getVessel(vesselId);
        if (!vessel) return;

        const compliance = this.calculator.calculateVesselCompliance(vessel, this.currentYear);
        const banking = this.calculator.calculateBankingBorrowing(vessel, this.currentYear);

        const modalContent = document.getElementById('modalContent');
        modalContent.innerHTML = `
            <h2>Vessel Details: ${vessel.name}</h2>
            <div class="vessel-details">
                <div class="detail-section">
                    <h3>Basic Information</h3>
                    <p><strong>Date Added:</strong> ${new Date(vessel.dateAdded).toLocaleDateString()}</p>
                    <p><strong>Name:</strong> ${vessel.name}</p>
                    <p><strong>IMO:</strong> ${vessel.imo}</p>
                    <p><strong>Type:</strong> ${vessel.type}</p>
                    <p><strong>Owner:</strong> ${this.getUserDisplayName(vessel.owner)}</p>
                </div>
                
                <div class="detail-section">
                    <h3>Compliance Status (${this.currentYear})</h3>
                    <p><strong>FuelEU Energy Used:</strong> ${vessel.fuelConsumption.toLocaleString()} MJ</p>
                    <p><strong>GHG Intensity:</strong> ${vessel.ghgIntensity.toFixed(2)} gCO2e/MJ</p>
                    <p><strong>Compliance Balance:</strong> ${compliance.complianceBalance > 0 ? '+' : ''}${compliance.complianceBalance.toFixed(2)} tCO2eq</p>
                    <p><strong>Status:</strong> <span class="compliance-indicator ${compliance.status}">${compliance.status.toUpperCase()}</span></p
                </div>
                
            </div>
        `;

        document.getElementById('vesselModal').style.display = 'block';
    }

    editVessel(vesselId) {
        const vessel = this.vesselManager.getVessel(vesselId);
        if (!vessel) return;

        // 🆕 ADD PERMISSION CHECK
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (currentUser && !this.permissions.canEditVessel(currentUser, vessel)) {
            alert('You do not have permission to edit this vessel.');
            return;
        }

        console.log('Editing vessel:', vesselId, vessel);

        // Find the current active tab to determine which form to populate
        const activeTab = document.querySelector('.pool-tab-content.active');
        if (!activeTab) {
            alert('No active pool tab found.');
            return;
        }

        const tabId = activeTab.id;

        // Pre-fill form with vessel data using pool-specific IDs
        const vesselNameEl = document.getElementById(`vesselName-${tabId}`);
        const imoNumberEl = document.getElementById(`imoNumber-${tabId}`);
        const vesselTypeEl = document.getElementById(`vesselType-${tabId}`);
        const fuelConsumptionEl = document.getElementById(`fuelConsumption-${tabId}`);
        const ghgIntensityEl = document.getElementById(`ghgIntensity-${tabId}`);
        const vesselOwnerEl = document.getElementById(`vesselOwner-${tabId}`);

        if (vesselNameEl) vesselNameEl.value = vessel.name;
        if (imoNumberEl) imoNumberEl.value = vessel.imo;
        if (vesselTypeEl) vesselTypeEl.value = vessel.type;
        if (fuelConsumptionEl) fuelConsumptionEl.value = vessel.fuelConsumption;
        if (ghgIntensityEl) ghgIntensityEl.value = vessel.ghgIntensity;
        if (vesselOwnerEl) vesselOwnerEl.value = vessel.owner || '';

        // Enter edit mode
        this.enterEditMode(vesselId);

        // Scroll to form
        const addVesselSection = document.getElementById(`addVesselSection-${tabId}`);
        if (addVesselSection) {
            addVesselSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    removeVessel(vesselId) {
        const vessel = this.vesselManager.getVessel(vesselId);
        if (!vessel) return;

        // ADD PERMISSION CHECK - allow users to delete their own vessels
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        const canDelete = currentUser && (
            this.permissions.canDeleteVessel(currentUser) || // Admin permission
            vessel.owner === currentUser.id // User owns the vessel
        );

        if (!canDelete) {
            alert('You do not have permission to delete this vessel.');
            return;
        }

        if (confirm(`Are you sure you want to remove "${vessel.name}" from the pool?`)) {
            try {
                this.vesselManager.removeVessel(vesselId);

                // Clean up selection state
                this.selectedVessels.delete(vesselId);

                // Refresh the current pool display
                const activeTab = document.querySelector('.pool-tab-content.active');
                if (activeTab) {
                    const tabId = activeTab.id;
                    const poolName = activeTab.dataset.pool;
                    if (poolName) {
                        this.updatePoolDisplay(poolName, tabId);
                        // Refresh selection display to update counts
                        this.refreshSelectionDisplay();
                    }
                }

                this.showNotification(`Vessel "${vessel.name}" removed successfully!`, 'success');
            } catch (error) {
                alert(`Error removing vessel: ${error.message}`);
            }
        }
    }

    // Selection and bulk actions
    toggleVesselSelection(vesselId) {
        if (this.selectedVessels.has(vesselId)) {
            this.selectedVessels.delete(vesselId);
        } else {
            this.selectedVessels.add(vesselId);
        }
        // Don't call updateDisplay() - just refresh selection display
        this.refreshSelectionDisplay();
    }

    toggleSelectAll(tabId) {
        const selectAllCheckbox = document.getElementById(`selectAllTable-${tabId}`);
        const shouldSelectAll = selectAllCheckbox?.checked || false;

        // Get vessels for current pool only
        const activeTab = document.querySelector('.pool-tab-content.active');
        const poolName = activeTab?.dataset.pool;

        let poolVessels = [];
        if (poolName) {
            poolVessels = this.vesselManager.getVesselsByPool(poolName);

            // Apply user access filtering
            if (this.authManager && this.authManager.userRole !== 'admin') {
                const currentUser = this.userManager.getUser(this.authManager.currentUser);
                poolVessels = poolVessels.filter(vessel =>
                    currentUser && currentUser.pools.includes(vessel.pool)
                );
            }
        }

        if (shouldSelectAll) {
            // Select all vessels in current pool
            poolVessels.forEach(vessel => this.selectedVessels.add(vessel.id));
        } else {
            // Deselect all vessels in current pool
            poolVessels.forEach(vessel => this.selectedVessels.delete(vessel.id));
        }

        this.refreshSelectionDisplay();
    }

    showBulkActions() {
        if (this.selectedVessels.size === 0) {
            alert('Please select at least one vessel for bulk actions.');
            return;
        }

        const action = prompt(`Selected ${this.selectedVessels.size} vessels. Choose action:\n\n1. Delete selected vessels\n2. Export selected vessels\n\nEnter 1 or 2:`);

        switch (action) {
            case '1':
                this.bulkDeleteVessels();
                break;
            case '2':
                this.bulkExportVessels();
                break;
            default:
                // Cancelled or invalid input
                break;
        }
    }

    bulkDeleteVessels() {
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (currentUser && !this.permissions.canDeleteVessel(currentUser)) {
            alert('You do not have permission to delete vessels.');
            return;
        }
        if (confirm(`Are you sure you want to delete ${this.selectedVessels.size} selected vessels? This cannot be undone.`)) {
            const deleted = this.vesselManager.bulkDelete(Array.from(this.selectedVessels));
            this.selectedVessels.clear();
            this.updateDisplay();
            this.showNotification(`${deleted} vessels deleted successfully!`, 'success');
        }
    }

    bulkExportVessels() {
        const selectedData = Array.from(this.selectedVessels).map(id =>
            this.vesselManager.getVessel(id)
        ).filter(vessel => vessel !== undefined);

        const exportData = {
            vessels: selectedData,
            exportDate: new Date().toISOString(),
            version: '1.0',
            selectedOnly: true
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

        const exportFileDefaultName = `fueleu_selected_vessels_${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.style.visibility = 'hidden';
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);

        this.showNotification(`${selectedData.length} selected vessels exported successfully!`, 'success');
    }

    // Data import/export
    exportData() {
        this.vesselManager.exportToJSON();
        this.showNotification('Data exported successfully!', 'success');
    }

    importData() {
        document.getElementById('fileInput').click();
    }

    handleFileImport(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const result = this.vesselManager.importFromJSON(e.target.result);
                this.updateDisplay();
                this.showNotification(result.message, 'success');
            } catch (error) {
                alert(`Import failed: ${error.message}`);
            }
        };
        reader.readAsText(file);
    }

    // Report generation
    generateVesselReport() {
        const vessels = this.vesselManager.getAllVessels();
        const compliance = this.calculator.calculatePoolCompliance(vessels, this.currentYear);

        const reportDiv = document.getElementById('reportOutput');
        let html = `
            <div class="report">
                <h3>Vessel Details Report - ${this.currentYear}</h3>
                <div class="report-section">
                    <h4>Individual Vessel Performance</h4>
                    <div class="vessel-report-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Vessel Name</th>
                                    <th>IMO</th>
                                    <th>Type</th>
                                    <th>GHG Intensity</th>
                                    <th>Target</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        compliance.vessels.forEach(vessel => {
            html += `
                <tr>
                    <td>${vessel.name}</td>
                    <td>${vessel.imo}</td>
                    <td>${vessel.type}</td>
                    <td>${vessel.ghgIntensity.toFixed(2)}</td>
                    <td>${vessel.targetIntensity.toFixed(2)}</td>
                    <td><span class="compliance-indicator ${vessel.status}">${vessel.status.toUpperCase()}</span></td>
                    <td>€${vessel.potentialPenalty.toFixed(2)}</td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="report-footer">
                    <p><em>Report generated on ${new Date().toLocaleString()}</em></p>
                </div>
            </div>
        `;

        reportDiv.innerHTML = html;
    }

    // Utility methods
    closeModal() {
        document.getElementById('vesselModal').style.display = 'none';
    }

    refreshData() {
        this.updateDisplay();
        this.showNotification('Data refreshed successfully!', 'success');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
            color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(notification);

        // Show notification
        setTimeout(() => notification.style.opacity = '1', 100);

        // Hide and remove notification
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 3000);
    }

    // refreshSelectionDisplay Method
    refreshSelectionDisplay() {
        const activeTab = document.querySelector('.pool-tab-content.active');
        if (!activeTab) {
            console.warn('No active tab found for refreshSelectionDisplay');
            return;
        }

        const tabId = activeTab.id;
        const poolName = activeTab.dataset.pool;

        // Get current pool's vessels for accurate counts
        let currentPoolVessels = [];
        if (poolName) {
            currentPoolVessels = this.vesselManager.getVesselsByPool(poolName);

            // Apply user access filtering
            if (this.authManager && this.authManager.userRole !== 'admin') {
                const currentUser = this.userManager.getUser(this.authManager.currentUser);
                currentPoolVessels = currentPoolVessels.filter(vessel =>
                    currentUser && currentUser.pools.includes(vessel.pool)
                );
            }
        }

        // Count selected vessels in current pool only
        const selectedInPool = currentPoolVessels.filter(vessel =>
            this.selectedVessels.has(vessel.id)
        ).length;

        // Update selected count
        const selectedCountEl = document.getElementById(`selectedCount-${tabId}`);
        if (selectedCountEl) {
            selectedCountEl.textContent = `${selectedInPool} selected`;
        }

        // Update individual checkboxes
        currentPoolVessels.forEach(vessel => {
            const checkbox = document.querySelector(`input[onchange*="toggleVesselSelection(${vessel.id})"]`);
            if (checkbox) {
                checkbox.checked = this.selectedVessels.has(vessel.id);
            }
        });

        // Update row styling
        currentPoolVessels.forEach(vessel => {
            const row = document.querySelector(`tr:has(input[onchange*="toggleVesselSelection(${vessel.id})"])`);
            if (row) {
                if (this.selectedVessels.has(vessel.id)) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            }
        });

        // Update select all checkbox - use pool vessel count, not global
        const selectAllTable = document.getElementById(`selectAllTable-${tabId}`);
        if (selectAllTable && currentPoolVessels.length > 0) {
            const allSelected = selectedInPool === currentPoolVessels.length;
            const someSelected = selectedInPool > 0;

            selectAllTable.checked = allSelected;
            selectAllTable.indeterminate = someSelected && !allSelected;
        } else if (selectAllTable) {
            selectAllTable.checked = false;
            selectAllTable.indeterminate = false;
        }
    }

    // Force Refresh Method
    refreshData() {
        console.log('🔄 Force refresh triggered');

        // Clear any cached data
        this.selectedVessels.clear();

        // Force update display
        this.updateDisplay();

        this.showNotification('Data refreshed successfully!', 'success');
    }

    // generate pool specific summary method
    generatePoolSummary(poolName = null) {
        let vessels;
        let reportTitle;

        if (poolName) {
            // Get vessels for specific pool only
            vessels = this.vesselManager.getVesselsByPool(poolName);
            reportTitle = `${poolName} Summary Report`;

            // Apply user access filtering if not admin
            if (this.authManager && this.authManager.userRole !== 'admin') {
                const currentUser = this.userManager.getUser(this.authManager.currentUser);
                vessels = vessels.filter(vessel =>
                    currentUser && currentUser.pools.includes(vessel.pool)
                );
            }
        } else {
            // Get all vessels (fallback for old calls)
            vessels = this.vesselManager.getAllVessels();
            reportTitle = 'All Pools Summary Report';
        }

        if (vessels.length === 0) {
            alert(`No vessels found in ${poolName || 'the system'}.`);
            return;
        }

        const compliance = this.calculator.calculatePoolCompliance(vessels, this.currentYear);
        const stats = {
            total: vessels.length,
            // Add other stats as needed
        };

        // Calculate surplus and deficit vessel counts
        const surplusVessels = compliance.vessels.filter(v => v.status === 'compliant').length;
        const deficitVessels = compliance.vessels.filter(v => v.status === 'non-compliant').length;

        // Build individual vessel table
        let vesselTableHtml = `<tbody>`;

        compliance.vessels.forEach(vessel => {
            const complianceBalanceText = vessel.complianceBalance < 0
                ? `${vessel.complianceBalance.toFixed(2)}`
                : `+${vessel.complianceBalance.toFixed(2)}`;

            vesselTableHtml += `
                <tr class="vessel-row ${vessel.status}">
                    <td class="vessel-name">${vessel.name}</td>
                    <td>${vessel.imo}</td>
                    <td class="vessel-type">${vessel.type}</td>
                    <td class="owner-name">${this.getUserDisplayName(vessel.owner)}</td>
                    <td class="ghg-value">${vessel.ghgIntensity.toFixed(2)}</td>
                    <td class="compliance-value ${vessel.complianceBalance < 0 ? 'deficit' : 'surplus'}">${complianceBalanceText}</td>
                    <td><span class="status-badge ${vessel.status}">${vessel.status}</span></td>
                </tr>
            `;
        });

        vesselTableHtml += `</tbody>`;

        // Create complete HTML document with pool-specific title
        const reportHtml = this.createPrintableReport(
            stats,
            compliance,
            surplusVessels,
            deficitVessels,
            vesselTableHtml,
            reportTitle,
            poolName
        );

        // Open in new window
        const newWindow = window.open('', '_blank', 'width=1200,height=800');
        newWindow.document.write(reportHtml);
        newWindow.document.close();

        // Show success notification
        this.showNotification(`${poolName || 'Pool'} Summary report opened in new tab!`, 'success');
    }

    createPrintableReport(stats, compliance, surplusVessels, deficitVessels, vesselTableHtml, reportTitle = 'Pool Summary Report', poolName = null) {
        const poolInfo = poolName ? `for ${poolName}` : 'for All Pools';

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${reportTitle}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background: #f8f9fa;
                    padding: 20px;
                }
                
                .report-container {
                    max-width: 1000px;
                    margin: 0 auto;
                    background: white;
                    padding: 40px;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                }
                
                .report-header {
                    text-align: center;
                    border-bottom: 3px solid #1e3c72;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                
                .report-header h1 {
                    color: #1e3c72;
                    font-size: 2.2rem;
                    margin-bottom: 10px;
                }
                
                .report-header p {
                    color: #666;
                    font-size: 1.1rem;
                }
                
                .download-section {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 15px;
                    background: rgba(42, 82, 152, 0.05);
                    border-radius: 8px;
                    border-left: 4px solid #2a5298;
                }
                
                .download-btn {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                    padding: 12px 25px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    text-decoration: none;
                    display: inline-block;
                    transition: all 0.3s ease;
                }
                
                .download-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(220, 53, 69, 0.4);
                }
                
                .section {
                    margin-bottom: 40px;
                }
                
                .section h2 {
                    color: #1e3c72;
                    border-bottom: 2px solid #e1e5e9;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                    font-size: 1.5rem;
                }
                
                .summary-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin-bottom: 30px;
                }
                
                .summary-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 15px;
                    background: rgba(42, 82, 152, 0.05);
                    border-radius: 6px;
                    border-left: 4px solid #2a5298;
                }
                
                .summary-item label {
                    font-weight: 600;
                    color: #333;
                }
                
                .summary-item value {
                    font-weight: 700;
                    color: #1e3c72;
                    font-family: 'Courier New', monospace;
                }
                
                .status-compliant {
                    color: #28a745 !important;
                }
                
                .status-non-compliant {
                    color: #dc3545 !important;
                }
                
                .compliance-balance.deficit {
                    color: #dc3545 !important;
                }
                
                .compliance-balance.surplus {
                    color: #28a745 !important;
                }
                
                .vessel-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                    font-size: 0.9rem;
                }
                
                .vessel-table thead {
                    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
                    color: white;
                }
                
                .vessel-table th {
                    padding: 12px 10px;
                    text-align: left;
                    font-weight: 600;
                    font-size: 0.85rem;
                }
                
                .vessel-table td {
                    padding: 10px;
                    border-bottom: 1px solid #e9ecef;
                }
                
                .vessel-table .vessel-row:hover {
                    background: rgba(42, 82, 152, 0.03);
                }
                
                .vessel-table .vessel-row.compliant {
                    border-left: 3px solid #28a745;
                }
                
                .vessel-table .vessel-row.non-compliant {
                    border-left: 3px solid #dc3545;
                }
                
                .vessel-name {
                    font-weight: 600;
                    color: #1e3c72;
                }
                
                .vessel-type {
                    text-transform: capitalize;
                    color: #6c757d;
                }
                
                .ghg-value {
                    font-family: 'Courier New', monospace;
                    text-align: right;
                }
                
                .compliance-value {
                    font-family: 'Courier New', monospace;
                    text-align: right;
                    font-weight: 600;
                }
                
                .compliance-value.deficit {
                    color: #dc3545;
                }
                
                .compliance-value.surplus {
                    color: #28a745;
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                
                .status-badge.compliant {
                    background: #d4edda;
                    color: #155724;
                }
                
                .status-badge.non-compliant {
                    background: #f8d7da;
                    color: #721c24;
                }
                
                .report-footer {
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 2px solid #e1e5e9;
                    text-align: center;
                    color: #666;
                    font-style: italic;
                }
                
                /* Print styles */
                @media print {
                    body {
                        background: white;
                        padding: 0;
                    }
                    
                    .download-section {
                        display: none;
                    }
                    
                    .report-container {
                        box-shadow: none;
                        padding: 20px;
                    }
                    
                    .vessel-table {
                        font-size: 0.8rem;
                    }
                    
                    .vessel-table th,
                    .vessel-table td {
                        padding: 8px 6px;
                    }
                }
                
                @media (max-width: 768px) {
                    .report-container {
                        padding: 20px;
                    }
                    
                    .summary-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .vessel-table {
                        font-size: 0.8rem;
                    }
                }
            </style>
        </head>
        <body>
            <div class="report-container">
                <div class="report-header">
                    <h1>FuelEU Maritime ${reportTitle}</h1>
                    <p>Comprehensive Compliance Analysis</p>
                </div>
                
                <div class="download-section">
                    <button class="download-btn" onclick="window.print()">📄 Download as PDF</button>
                    <p style="margin-top: 10px; font-size: 0.9rem; color: #666;">
                        Click the button above to save this report as PDF
                    </p>
                </div>
                
                <div class="section">
                    <h2>Pool Overview</h2>
                    <div class="summary-grid">
                        <div class="summary-item">
                            <label>Analysis Year:</label>
                            <value>2025</value>
                        </div>
                        <div class="summary-item">
                            <label>Target Intensity:</label>
                            <value>89.34 gCO2e/MJ</value>
                        </div>
                        <div class="summary-item">
                            <label>Pool Name:</label>
                            <value>${poolName || 'All Pools'}</value>
                        </div>
                        <div class="summary-item">
                            <label>Total Vessels:</label>
                            <value>${stats.total}</value>
                        </div>
                        <div class="summary-item">
                            <label>Surplus Vessels:</label>
                            <value>${surplusVessels}</value>
                        </div>
                        <div class="summary-item">
                            <label>Deficit Vessels:</label>
                            <value>${deficitVessels}</value>
                        </div>
                        <div class="summary-item">
                            <label>Pool Average GHG Intensity:</label>
                            <value>${compliance.summary.poolAverageIntensity.toFixed(3)} gCO2e/MJ</value>
                        </div>
                        <div class="summary-item">
                            <label>Pool Net Compliance Balance:</label>
                            <value class="compliance-balance ${compliance.summary.poolComplianceBalance < 0 ? 'deficit' : 'surplus'}">
                                ${compliance.summary.poolComplianceBalance < 0 ?
                `${compliance.summary.poolComplianceBalance.toFixed(2)} tCO2eq` :
                `${compliance.summary.poolComplianceBalance.toFixed(2)} tCO2eq`}
                            </value>
                        </div>
                        <div class="summary-item">
                            <label>Pool Status:</label>
                            <value class="status-${compliance.summary.poolCompliant ? 'compliant' : 'non-compliant'}">
                                ${compliance.summary.poolCompliant ? '✅ Compliant' : '❌ Non-Compliant'}
                            </value>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Individual Vessel Performance</h2>
                    <table class="vessel-table">
                        <thead>
                            <tr>
                                <th>Vessel Name</th>
                                <th>IMO</th>
                                <th>Type</th>
                                <th>Owner</th>
                                <th>GHG Intensity</th>
                                <th>Compliance Balance</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        ${vesselTableHtml}
                    </table>
                </div>
                
                <div class="report-footer">
                    <p>Report generated on ${new Date().toLocaleString()}</p>
                    <p>FuelEU Maritime Compliance Pool Management System</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    enterEditMode(vesselId) {
        this.editingVesselId = parseInt(vesselId);
        console.log('Entered edit mode for vessel:', this.editingVesselId);

        // Find the current active tab
        const activeTab = document.querySelector('.pool-tab-content.active');
        if (!activeTab) {
            console.warn('No active tab found for enterEditMode');
            return;
        }

        // Update button appearance using pool-specific selector
        const addButton = activeTab.querySelector('.btn-icon.add');
        if (addButton) {
            const addSpan = addButton.querySelector('span');
            if (addSpan) {
                addSpan.textContent = '✏️';
            }
            addButton.title = 'Update Vessel';
            addButton.classList.add('editing');
        }

        // Update instructions using pool-specific selector
        const instructions = activeTab.querySelector('.form-instructions p');
        if (instructions) {
            instructions.innerHTML = '<strong>Edit Mode:</strong> Modify fields and click ✏️ to update vessel.';
        }

        // Highlight the row being edited in the vessel table
        const vesselRows = document.querySelectorAll('.vessel-row');
        vesselRows.forEach(row => {
            const checkbox = row.querySelector('input[onchange*="' + vesselId + '"]');
            if (checkbox) {
                row.classList.add('editing');
            }
        });
    }

    //Edit Mode Methods
    exitEditMode() {
        this.editingVesselId = null;

        // Find the current active tab
        const activeTab = document.querySelector('.pool-tab-content.active');
        if (!activeTab) {
            console.warn('No active tab found for exitEditMode');
            return;
        }

        const tabId = activeTab.id;

        // Reset button appearance using pool-specific selectors
        const addButton = activeTab.querySelector('.btn-icon.add');
        if (addButton) {
            const addSpan = addButton.querySelector('span');
            if (addSpan) {
                addSpan.textContent = '+';
            }
            addButton.title = 'Add Vessel';
            addButton.classList.remove('editing');
        }

        // Reset instructions using pool-specific selector
        const instructions = activeTab.querySelector('.form-instructions p');
        if (instructions) {
            instructions.innerHTML = '<strong>Instructions:</strong> Fill in all fields and click + to add vessel to the fleet.';
        }

        // Remove editing highlight from vessel rows
        const editingRows = document.querySelectorAll('.vessel-row.editing');
        editingRows.forEach(row => row.classList.remove('editing'));
    }

    // 🆕 HELPER METHOD
    canUserEdit(vessel) {
        if (!this.authManager) return true;
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        return currentUser && this.permissions.canEditVessel(currentUser, vessel);
    }

    //Pool Overview Title method
    updatePoolOverviewTitle(selectedPool, vessels) {
        const titleElement = document.getElementById('poolOverviewTitle');
        if (titleElement) {
            if (selectedPool) {
                const poolInfo = this.poolManager.getPool(selectedPool);
                const poolDesc = poolInfo ? ` - ${poolInfo.description}` : '';
                titleElement.textContent = `${selectedPool} Overview${poolDesc} - 2025 (Target Intensity: 89.34 gCO2e/MJ)`;
            } else {
                const poolCount = this.poolManager.getAllPools().length;
                titleElement.textContent = `All Pools Overview (${poolCount} pools) - 2025 (Target Intensity: 89.34 gCO2e/MJ)`;
            }
        }
    }

    getUserDisplayName(userId) {
        if (!userId) return 'Unassigned';

        const user = this.userManager.getUser(userId);
        return user ? (user.name || userId) : userId;
    }

    // User Management Methods
    refreshUserList() {
        this.displayUserManagement();
    }

    displayUserManagement() {
        const container = document.getElementById('userManagementList');
        if (!container) {
            console.warn('User management container not found');
            return;
        }

        const users = this.userManager.getAllUsers();

        let html = `
            <div class="users-management-table">
                <table>
                    <thead>
                        <tr>
                            <th>User ID</th>
                            <th>Display Name</th>
                            <th>Role</th>
                            <th>Pool Access</th>
                            <th>Vessels Owned</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        users.forEach(user => {
            const vesselCount = this.vesselManager.getVesselsByOwner(user.id).length;
            const createdDate = user.created ? new Date(user.created).toLocaleDateString() : 'N/A';
            const poolAccess = user.pools.join(', ') || 'None';

            html += `
                <tr>
                    <td class="user-id">${user.id}</td>
                    <td class="user-name">${user.name}</td>
                    <td>
                        <span class="role-badge ${user.role}">${user.role.toUpperCase()}</span>
                    </td>
                    <td class="pool-access">${poolAccess}</td>
                    <td class="vessel-count">${vesselCount}</td>
                    <td>${createdDate}</td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="dashboard.editUser('${user.id}')" title="Edit User">
                                <span>✏️</span>
                            </button>
                            ${user.id !== 'admin' ? `
                                <button class="btn-icon danger" onclick="dashboard.deleteUser('${user.id}')" title="Delete User">
                                    <span>🗑️</span>
                                </button>
                            ` : '<span class="protected">Protected</span>'}
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    }

    showCreateUserModal() {
        this.resetUserModal();
        this.populatePoolCheckboxes();
        document.getElementById('userModalTitle').textContent = 'Create New User';
        document.getElementById('userModalSubmit').textContent = 'Create User';
        document.getElementById('userModalSubmit').onclick = () => this.createUser();
        document.getElementById('userModal').style.display = 'block';
    }

    editUser(userId) {
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (!this.permissions.canCreatePool(currentUser)) { // Reusing pool permission for user management
            alert('You do not have permission to edit users.');
            return;
        }

        const user = this.userManager.getUser(userId);
        if (!user) {
            alert('User not found.');
            return;
        }

        // Populate form with existing data
        document.getElementById('userId').value = user.id;
        document.getElementById('userId').disabled = true; // Can't change user ID
        document.getElementById('userName').value = user.name || '';

        // Handle role dropdown - disable for admin user
        const roleSelect = document.getElementById('userRole');
        roleSelect.value = user.role;

        if (userId === 'admin') {
            roleSelect.disabled = true;
            roleSelect.style.backgroundColor = '#f5f5f5';
            roleSelect.style.color = '#666';
        } else {
            roleSelect.disabled = false;
            roleSelect.style.backgroundColor = '';
            roleSelect.style.color = '';
        }
        document.getElementById('userPassword').value = ''; // Don't show existing password

        // this.populatePoolCheckboxes(user.pools);
        // Special handling for admin pool access
        if (userId === 'admin') {
            this.populatePoolCheckboxes('all'); // Pass 'all' for admin
        } else {
            this.populatePoolCheckboxes(user.pools);
        }

        // Update modal for edit mode
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('userModalSubmit').textContent = 'Update User';
        document.getElementById('userModalSubmit').onclick = () => this.updateUser(userId);

        document.getElementById('userModal').style.display = 'block';
    }

    populatePoolCheckboxes(selectedPools = []) {
        const container = document.getElementById('userPoolAccess');
        const pools = this.poolManager.getAllPools();

        let html = '';

        // Check if this is for admin user
        if (selectedPools === 'all') {
            // Admin gets all pools access - show but disable checkboxes
            html += '<div class="admin-pool-notice"><p><strong>Admin Access:</strong> Automatic access to all pools</p></div>';
            pools.forEach(pool => {
                html += `
                <div class="checkbox-item">
                    <label>
                        <input type="checkbox" value="${pool.name}" checked disabled>
                        <span class="admin-pool-label">${pool.name} - ${pool.description || 'No description'}</span>
                    </label>
                </div>
            `;
            });
        } else {
            // Regular users get selectable checkboxes
            pools.forEach(pool => {
                const isChecked = selectedPools.includes(pool.name) ? 'checked' : '';
                html += `
                <div class="checkbox-item">
                    <label>
                        <input type="checkbox" value="${pool.name}" ${isChecked}>
                        ${pool.name} - ${pool.description || 'No description'}
                    </label>
                </div>
            `;
            });
        }

        container.innerHTML = html;
    }

    createUser() {
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (!this.permissions.canCreatePool(currentUser)) {
            alert('You do not have permission to create users.');
            return;
        }

        const userId = document.getElementById('userId').value.trim();
        const name = document.getElementById('userName').value.trim();
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('userPassword').value;

        // Get selected pools
        const poolCheckboxes = document.querySelectorAll('#userPoolAccess input[type="checkbox"]:checked');
        const pools = Array.from(poolCheckboxes).map(cb => cb.value);

        if (!userId || !name || !password) {
            alert('User ID, name, and password are required');
            return;
        }

        try {
            // Add to UserManager
            this.userManager.createUser({ id: userId, name, role, pools });

            // Add to AuthManager using the clean interface
            this.authManager.addUser(userId, { password, role, pools });

            this.displayUserManagement();
            this.updatePoolLists();
            this.closeUserModal();
            this.showNotification(`User "${name}" created and can now login!`, 'success');
        } catch (error) {
            alert(`Error creating user: ${error.message}`);
        }
    }

    updateUser(userId) {
        // This should only be called from the user management interface
        // Add a check to prevent accidental calls
        if (!document.getElementById('userModal') ||
            document.getElementById('userModal').style.display === 'none') {
            console.warn('updateUser called but user modal is not open');
            return;
        }

        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (!this.permissions.canCreatePool(currentUser)) {
            alert('You do not have permission to edit users.');
            return;
        }

        const name = document.getElementById('userName').value.trim();
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('userPassword').value;

        // Handle pool access
        let pools;
        if (userId === 'admin') {
            // Admin automatically gets all pools
            pools = this.poolManager.getAllPools().map(pool => pool.name);
        } else {
            // Regular users get selected pools
            const poolCheckboxes = document.querySelectorAll('#userPoolAccess input[type="checkbox"]:checked:not([disabled])');
            pools = Array.from(poolCheckboxes).map(cb => cb.value);
        }

        // Prevent admin role changes
        const currentRole = userId === 'admin' ? 'admin' : role;

        // const poolCheckboxes = document.querySelectorAll('#userPoolAccess input[type="checkbox"]:checked');
        // const pools = Array.from(poolCheckboxes).map(cb => cb.value);

        if (!name) {
            alert('User name is required');
            return;
        }

        try {
            const updates = { name, role: currentRole, pools };
            this.userManager.updateUser(userId, updates);

            // Update AuthManager
            const authUpdates = { role: currentRole, pools };
            if (password) authUpdates.password = password;
            this.authManager.updateUserData(userId, authUpdates);

            // IMPORTANT: Force refresh of login dropdown to show updated pools
            this.authManager.updateLoginDropdown();

            this.displayUserManagement();
            this.updatePoolLists();
            this.closeUserModal();
            this.showNotification(`User "${name}" updated successfully!`, 'success');
        } catch (error) {
            alert(`Error updating user: ${error.message}`);
        }
    }

    deleteUser(userId) {
        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        if (!this.permissions.canCreatePool(currentUser)) {
            alert('You do not have permission to delete users.');
            return;
        }

        const user = this.userManager.getUser(userId);
        if (!user) {
            alert('User not found.');
            return;
        }

        const vesselCount = this.vesselManager.getVesselsByOwner(userId).length;
        let confirmMessage = `Are you sure you want to delete user "${user.name}"?`;

        if (vesselCount > 0) {
            confirmMessage += `\n\nThis user owns ${vesselCount} vessels. These vessels will need to be reassigned to another owner.`;
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            // Handle vessels owned by this user
            if (vesselCount > 0) {
                const vessels = this.vesselManager.getVesselsByOwner(userId);
                vessels.forEach(vessel => {
                    // Reassign to admin or ask for reassignment
                    this.vesselManager.updateVessel(vessel.id, { owner: 'admin' }, currentUser);
                });
            }

            this.userManager.deleteUser(userId);

            // Remove from auth system
            if (window.authManager && window.authManager.users[userId]) {
                delete window.authManager.users[userId];
            }

            this.displayUserManagement();
            this.updatePoolLists();
            this.updateDisplay(); // Refresh vessel list
            this.showNotification(`User "${user.name}" deleted successfully!`, 'success');
        } catch (error) {
            alert(`Error deleting user: ${error.message}`);
        }
    }

    resetUserModal() {
        document.getElementById('userId').value = '';
        document.getElementById('userId').disabled = false;
        document.getElementById('userName').value = '';
        document.getElementById('userRole').value = 'user';
        document.getElementById('userPassword').value = '';
        document.getElementById('userPoolAccess').innerHTML = '';
    }

    closeUserModal() {
        document.getElementById('userModal').style.display = 'none';
        this.resetUserModal();
    }

    submitUserForm() {
        // This will be overridden by the onclick handlers
    }

    // method to generate dynamic tabs
    generatePoolTabs() {
        const tabsContainer = document.getElementById('dynamicTabs');
        if (!tabsContainer || !this.authManager) return;

        const currentUser = this.userManager.getUser(this.authManager.currentUser);
        let availablePools = [];

        if (currentUser.role === 'admin') {
            // Admin sees management tab plus all pools
            availablePools = [{ name: 'Management', isManagement: true }];
            availablePools.push(...this.poolManager.getAllPools());
        } else {
            // Regular users see only their assigned pools
            if (this.authManager.selectedPool) {
                const selectedPoolData = this.poolManager.getPool(this.authManager.selectedPool);
                if (selectedPoolData) {
                    availablePools = [selectedPoolData];
                }
            }
        }

        let tabsHTML = '';
        availablePools.forEach((pool, index) => {
            const isActive = index === 0 ? 'active' : '';
            const tabId = pool.isManagement ? 'management' : pool.name.toLowerCase().replace(/\s+/g, '-');

            tabsHTML += `
                <div class="tab ${isActive}" onclick="dashboard.switchPoolTab('${tabId}', '${pool.name}')">
                    ${pool.isManagement ? 'Pool & User Management' : pool.name}
                </div>
            `;
        });

        tabsContainer.innerHTML = tabsHTML;

        // Generate corresponding tab content
        this.generatePoolTabContent(availablePools);

        // automatically load the first tab
        if (availablePools.length > 0) {
            const firstPool = availablePools[0];
            const firstTabId = firstPool.isManagement ? 'management' : firstPool.name.toLowerCase().replace(/\s+/g, '-');

            setTimeout(() => {
                if (!firstPool.isManagement) {
                    this.updatePoolDisplay(firstPool.name, firstTabId);
                    this.bindPoolControls(firstTabId);
                } else {
                    // Load management data with longer delay to ensure DOM is ready
                    setTimeout(() => {
                        this.displayPoolManagement();
                        this.displayUserManagement();
                    }, 100);
                }
            }, 200);
        }
    }

    // generate pool-specific content
    generatePoolTabContent(pools) {
        // Remove existing tab content
        const existingContent = document.querySelectorAll('.pool-tab-content');
        existingContent.forEach(content => content.remove());

        // Get current user to check if admin
        const currentUser = this.userManager.getUser(this.authManager.currentUser);

        // Find where to insert content (after tabs)
        const tabsElement = document.getElementById('dynamicTabs');

        pools.forEach((pool, index) => {
            const isActive = index === 0 ? 'active' : '';
            const tabId = pool.isManagement ? 'management' : pool.name.toLowerCase().replace(/\s+/g, '-');

            let contentHTML = '';

            if (pool.isManagement) {
                // Management tab content (existing)
                contentHTML = `
                    <div id="${tabId}" class="pool-tab-content tab-content ${isActive}">
                        <!-- System Data Management -->
                        <div class="card">
                            <h2>System Data Management</h2>
                            <div class="data-management-controls">
                                <button class="btn btn-primary" onclick="dashboard.exportAllData()" title="Download system backup">Export All Data</button>
                                <button class="btn btn-secondary" onclick="dashboard.importAllData()" title="Restore from backup file">Import Data</button>
                            </div>
                            <div class="data-info">
                                <p><strong>Export:</strong> Downloads all vessels, pools, and users as a backup file</p>
                                <p><strong>Import:</strong> Restores data from a previously exported backup file</p>
                                <p><em>Note: Admin settings are preserved during import</em></p>
                            </div>
                        </div>
                        <div class="card">
                            <h2>Pool Management</h2>
                            <div class="pool-management-controls">
                                <button class="btn btn-primary" onclick="dashboard.showCreatePoolModal()">Create Pool</button>
                                <button class="btn btn-secondary" onclick="dashboard.refreshPoolList()">Refresh</button>
                            </div>
                            <div id="poolManagementList"></div>
                        </div>
                        <div class="card">
                            <h2>User Management</h2>
                            <div class="user-management-controls">
                                <button class="btn btn-primary" onclick="dashboard.showCreateUserModal()">Create User</button>
                                <button class="btn btn-secondary" onclick="dashboard.refreshUserList()">Refresh</button>
                            </div>
                            <div id="userManagementList"></div>
                        </div>
                    </div>
                `;
            } else {
                // Pool-specific content
                contentHTML = `
                    <div id="${tabId}" class="pool-tab-content tab-content ${isActive}" data-pool="${pool.name}">
                        <div class="pool-summary">
                            <h2 id="poolOverviewTitle-${tabId}">${pool.name} Overview - 2025 (Target Intensity: 89.34 gCO2e/MJ)</h2>
                            <div class="pool-stats">
                                <div class="stat-card">
                                    <div class="stat-number" id="totalVessels-${tabId}">0</div>
                                    <div class="stat-label">Total Vessels</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-number" id="compliantVessels-${tabId}">0</div>
                                    <div class="stat-label">Compliant Vessels</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-number" id="poolDeficit-${tabId}">0.0</div>
                                    <div class="stat-label">Pool Deficit (tCO2eq)</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-number" id="poolSurplus-${tabId}">0.0</div>
                                    <div class="stat-label">Pool Surplus (tCO2eq)</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-number" id="netComplianceBalance-${tabId}">0.0</div>
                                    <div class="stat-label">Pool Status (tCO2eq)</div>
                                </div>
                            </div>
                        </div>

                        <div class="add-vessel-section" id="addVesselSection-${tabId}">
                            <div class="card">
                                <h2>Add New Vessel</h2>
                                <div class="add-vessel-single-row-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th class="vessel-name-col">Vessel Name</th>
                                                <th class="imo-col">IMO</th>
                                                <th class="type-col">Type</th>
                                                <th class="admin-only owner-col">Owner</th>
                                                <th class="energy-col">FuelEU Energy (MJ)</th>
                                                <th class="ghg-col">Avg. GHG Intensity (gCO2eq/MJ)</th>
                                                <th class="actions-col">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr class="add-vessel-row">
                                                <td>
                                                    <input type="text" id="vesselName-${tabId}" required placeholder="Enter vessel name" class="table-input">
                                                </td>
                                                <td>
                                                    <input type="text" id="imoNumber-${tabId}" pattern="[0-9]{7}" required placeholder="7 digits" class="table-input">
                                                </td>
                                                <td>
                                                    <select id="vesselType-${tabId}" required class="table-select">
                                                        <option value="">Select Type</option>
                                                        <option value="container">Container Ship</option>
                                                        <option value="bulk">Bulk Carrier</option>
                                                        <option value="tanker">Tanker</option>
                                                        <option value="passenger">Passenger Ship</option>
                                                        <option value="ro-ro">RoRo</option>
                                                        <option value="general">General Cargo</option>
                                                        <option value="other">Other</option>
                                                    </select>
                                                </td>
                                                <td class="admin-only">
                                                    <select id="vesselOwner-${tabId}" class="table-select">
                                                        <option value="">Select Owner</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <input type="number" id="fuelConsumption-${tabId}" min="0" required placeholder="e.g., 45,000,000" class="table-input">
                                                </td>
                                                <td>
                                                    <input type="number" id="ghgIntensity-${tabId}" step="0.01" required placeholder="e.g., 89.25" class="table-input">
                                                </td>
                                                <td class="actions-col">
                                                    <div class="action-buttons">
                                                        <button type="button" class="btn-icon add" onclick="dashboard.addVesselToPool('${pool.name}', '${tabId}')" title="Add Vessel">
                                                            <span>+</span>
                                                        </button>
                                                        <button type="button" class="btn-icon clear" onclick="dashboard.clearPoolForm('${tabId}')" title="Clear Form">
                                                            <span>×</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div class="card">
                            <h2>Vessel Fleet - ${pool.name}</h2>
                            <div class="fleet-info-expanded">
                                <div class="fleet-stats">
                                    <span id="selectedCount-${tabId}">0 selected</span>
                                    <span class="vessel-count" id="vesselCount-${tabId}">0 vessels total</span>
                                </div>
                                
                                <div class="fleet-controls-inline">
                                    <div class="search-filter-group">
                                        <div class="control-item">
                                            <input type="text" id="searchVessels-${tabId}" placeholder="Search vessel or IMO" class="control-input-inline">
                                        </div>
                                        <div class="control-item">
                                            <select id="vesselFilter-${tabId}" class="control-select-inline">
                                                <option value="">All Status</option>
                                                <option value="compliant">Compliant</option>
                                                <option value="non-compliant">Non-Compliant</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div class="action-buttons-group">
                                        <button class="btn btn-outline btn-sm" disabled title="Feature coming soon">Bulk Actions</button>
                                        <button class="btn btn-sm" onclick="dashboard.refreshPoolData('${pool.name}')">Refresh</button>
                                        <button class="btn btn-outline btn-sm" disabled title="Feature coming soon">Import Data</button>
                                        <!-- <button class="btn btn-secondary btn-sm" onclick="dashboard.importVesselsFromCSV()" title="Import vessels from CSV file">
                                            Import CSV
                                        </button>
                                        <button class="btn btn-outline btn-sm" onclick="dashboard.downloadCSVTemplate()" title="Download CSV template">
                                            Template
                                        </button> -->
                                        <button class="btn btn-secondary btn-sm" onclick="dashboard.exportPoolData('${pool.name}')">Export Data</button>
                                        <button class="btn btn-primary btn-sm" onclick="dashboard.generatePoolSummary('${pool.name}')">Pool Summary</button>
                                    </div>
                                </div>
                            </div>
                            <div id="vesselsList-${tabId}"></div>
                        </div>
                    </div>
                `;
            }

            tabsElement.insertAdjacentHTML('afterend', contentHTML);
        });

        // After inserting the content, populate owner dropdowns for admin users
        if (currentUser && currentUser.role === 'admin') {
            setTimeout(() => {
                pools.forEach(pool => {
                    if (!pool.isManagement) {
                        const tabId = pool.name.toLowerCase().replace(/\s+/g, '-');
                        const ownerSelect = document.getElementById(`vesselOwner-${tabId}`);
                        if (ownerSelect) {
                            const allUsers = this.userManager.getAllUsers();
                            ownerSelect.innerHTML = '<option value="">Select Owner</option>';
                            allUsers.forEach(user => {
                                const option = document.createElement('option');
                                option.value = user.id;
                                option.textContent = user.name || user.id;
                                ownerSelect.appendChild(option);
                            });
                            console.log(`Populated owner dropdown for ${tabId}:`, ownerSelect.options.length);
                        } else {
                            console.warn(`Owner select not found for ${tabId}`);
                        }
                    }
                });
            }, 200);
        }
    }

    // new tab switching method
    switchPoolTab(tabId, poolName) {
        // Hide all tab contents
        document.querySelectorAll('.pool-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab content and mark tab as active
        document.getElementById(tabId).classList.add('active');
        event.target.classList.add('active');

        this.currentView = tabId;
        this.currentPool = poolName === 'Management' ? null : poolName;

        // Refresh content for the selected pool
        if (poolName !== 'Management') {
            this.updatePoolDisplay(poolName, tabId);
            this.bindPoolControls(tabId);
        } else {
            // Wait a bit longer for management tab elements to be ready
            setTimeout(() => {
                this.displayPoolManagement();
                this.displayUserManagement();
            }, 300);
        }
    }

    // pool-specific update method
    updatePoolDisplay(poolName, tabId) {
        // Get vessels for this specific pool
        let vessels = this.vesselManager.getVesselsByPool(poolName);

        // Apply user access filtering
        if (this.authManager && this.authManager.userRole !== 'admin') {
            const currentUser = this.userManager.getUser(this.authManager.currentUser);
            vessels = vessels.filter(vessel =>
                currentUser && currentUser.pools.includes(vessel.pool)
            );
        }

        // Calculate compliance
        const compliance = this.calculator.calculatePoolCompliance(vessels, this.currentYear);

        // Clean up any stale selections
        this.cleanupSelections();

        // Update pool-specific stats
        this.updatePoolStats(compliance.summary, tabId);
        this.displayPoolVessels(vessels, tabId);

        // Bind controls after display is updated
        this.bindPoolControls(tabId);
    }

    updatePoolStats(summary, tabId) {
        if (!summary) {
            summary = {
                totalVessels: 0,
                compliantVessels: 0,
                poolComplianceBalance: 0,
                poolComplianceDeficit: 0,
                poolComplianceSurplus: 0
            };
        }

        document.getElementById(`totalVessels-${tabId}`).textContent = summary.totalVessels || 0;
        document.getElementById(`compliantVessels-${tabId}`).textContent = summary.compliantVessels || 0;

        // Pool deficit
        const deficitElement = document.getElementById(`poolDeficit-${tabId}`);
        const deficitValue = Number(summary.poolComplianceDeficit || 0);
        deficitElement.textContent = deficitValue > 0 ? `-${deficitValue.toFixed(2)}` : '0.00';
        if (deficitValue > 0) {
            deficitElement.className = 'stat-number deficit-value';
        } else {
            deficitElement.className = 'stat-number';
        }

        // document.getElementById(`poolSurplus-${tabId}`).textContent = Number(summary.poolComplianceSurplus || 0).toFixed(2);
        // Pool surplus with green styling
        const surplusElement = document.getElementById(`poolSurplus-${tabId}`);
        const surplusValue = Number(summary.poolComplianceSurplus || 0);
        surplusElement.textContent = surplusValue.toFixed(2);
        if (surplusValue > 0) {
            surplusElement.className = 'stat-number surplus-value';
        } else {
            surplusElement.className = 'stat-number';
        }

        // Net Compliance Balance
        const netBalance = summary.poolComplianceBalance || 0;
        const netBalanceElement = document.getElementById(`netComplianceBalance-${tabId}`);

        const statusText = netBalance >= 0 ? 'Compliant' : 'Non-Compliant';
        netBalanceElement.innerHTML = `
            <div class="pool-status-value">${netBalance.toFixed(2)}</div>
            <div class="pool-status-text">${statusText}</div>
        `;

        if (netBalance < 0) {
            netBalanceElement.className = 'stat-number deficit-value';
        } else {
            netBalanceElement.className = 'stat-number surplus-value';
        }
    }

    displayPoolVessels(vessels, tabId) {
        const container = document.getElementById(`vesselsList-${tabId}`);
        if (!container) return;

        if (vessels.length === 0) {
            container.innerHTML = '<div class="no-vessels">No vessels found in this pool.</div>';
            return;
        }

        // Calculate compliance for vessels
        const compliance = this.calculator.calculatePoolCompliance(vessels, this.currentYear);
        const vesselsWithCompliance = compliance.vessels;

        let tableHtml = `
            <div class="vessels-table">
                <table>
                    <thead>
                        <tr>
                            <th class="select-col">
                                <input type="checkbox" id="selectAllTable-${tabId}" onchange="dashboard.toggleSelectAll('${tabId}')">
                            </th>
                            <th>Vessel Name</th>
                            <th>IMO</th>
                            <th>Type</th>
                            <th>Owner</th>
                            <th>FuelEU Energy (MJ)</th>
                            <th>Avg. GHG Intensity (gCO2eq/MJ)</th>
                            <th>Compliance Balance (tCO2eq)</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        vesselsWithCompliance.forEach(vessel => {
            const isSelected = this.selectedVessels.has(vessel.id);
            const complianceBalanceText = vessel.complianceBalance < 0
                ? `${vessel.complianceBalance.toFixed(2)}`
                : `+${vessel.complianceBalance.toFixed(2)}`;

            tableHtml += `
                <tr class="${isSelected ? 'selected' : ''} ${vessel.status}">
                    <td class="select-col">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                            onchange="dashboard.toggleVesselSelection(${vessel.id})">
                    </td>
                    <td class="vessel-name">${vessel.name}</td>
                    <td>${vessel.imo}</td>
                    <td class="vessel-type">${vessel.type}</td>
                    <td class="owner-name">${this.getUserDisplayName(vessel.owner)}</td>
                    <td class="energy-value">${vessel.fuelConsumption.toLocaleString()}</td>
                    <td class="ghg-value">${vessel.ghgIntensity.toFixed(2)}</td>
                    <td class="compliance-value ${vessel.complianceBalance < 0 ? 'deficit' : 'surplus'}">${complianceBalanceText}</td>
                    <td>
                        <span class="status-badge ${vessel.status}">${vessel.status}</span>
                    </td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="dashboard.viewVesselDetails(${vessel.id})" title="Details">
                                <span>👁</span>
                            </button>
                            ${this.canUserEdit(vessel) ? `
                                <button class="btn-icon" onclick="dashboard.editVessel(${vessel.id})" title="Edit">
                                    <span>✏️</span>
                                </button>
                            ` : '<span class="no-permission">Read Only</span>'}
                            ${(() => {
                    const currentUser = this.userManager.getUser(this.authManager.currentUser);
                    return currentUser && (this.permissions.canDeleteVessel(currentUser) || vessel.owner === currentUser.id);
                })() ? `
                                <button class="btn-icon danger" onclick="dashboard.removeVessel(${vessel.id})" title="Remove">
                                    <span>🗑️</span>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHtml;

        // Update vessel count
        const vesselCountEl = document.getElementById(`vesselCount-${tabId}`);
        if (vesselCountEl) {
            vesselCountEl.textContent = `${vesselsWithCompliance.length} vessels total`;
        }
    }

    addVesselToPool(poolName, tabId) {
        const currentUser = this.authManager ? this.userManager.getUser(this.authManager.currentUser) : null;

        if (currentUser && !this.permissions.canCreateVessel(currentUser)) {
            alert('You do not have permission to create vessels.');
            return;
        }

        try {
            const vesselData = {
                name: document.getElementById(`vesselName-${tabId}`).value.trim(),
                imo: document.getElementById(`imoNumber-${tabId}`).value.trim(),
                type: document.getElementById(`vesselType-${tabId}`).value,
                fuelConsumption: parseFloat(document.getElementById(`fuelConsumption-${tabId}`).value),
                ghgIntensity: parseFloat(document.getElementById(`ghgIntensity-${tabId}`).value),
                pool: poolName
            };

            // Set owner
            if (currentUser) {
                if (currentUser.role === 'admin') {
                    const ownerSelect = document.getElementById(`vesselOwner-${tabId}`);
                    const selectedOwner = ownerSelect ? ownerSelect.value : '';
                    vesselData.owner = selectedOwner || currentUser.id;
                } else {
                    vesselData.owner = currentUser.id;
                }
            }

            if (this.editingVesselId) {
                // Edit mode
                this.vesselManager.updateVessel(this.editingVesselId, vesselData, currentUser);
                this.showNotification(`Vessel "${vesselData.name}" updated successfully!`, 'success');
                this.exitEditMode();
            } else {
                // Add mode
                this.vesselManager.addVessel(vesselData, currentUser);
                this.showNotification(`Vessel "${vesselData.name}" added to ${poolName}!`, 'success');
            }

            // Refresh the current pool display
            this.updatePoolDisplay(poolName, tabId);
            this.clearPoolForm(tabId);

        } catch (error) {
            console.error('Error in addVesselToPool:', error);
            alert(`Error ${this.editingVesselId ? 'updating' : 'adding'} vessel: ${error.message}`);
        }
    }

    clearPoolForm(tabId) {
        document.getElementById(`vesselName-${tabId}`).value = '';
        document.getElementById(`imoNumber-${tabId}`).value = '';
        document.getElementById(`vesselType-${tabId}`).value = '';
        document.getElementById(`fuelConsumption-${tabId}`).value = '';
        document.getElementById(`ghgIntensity-${tabId}`).value = '';

        const ownerSelect = document.getElementById(`vesselOwner-${tabId}`);
        if (ownerSelect) {
            ownerSelect.value = '';
        }

        // Exit edit mode if active
        if (this.editingVesselId) {
            this.exitEditMode();
        }
    }

    bindPoolControls(tabId) {
        // Bind search input - use input event for real-time search
        const searchInput = document.getElementById(`searchVessels-${tabId}`);
        if (searchInput) {
            // Remove any existing listeners to prevent duplicates
            searchInput.removeEventListener('input', searchInput._boundHandler);

            // Create and store the handler
            searchInput._boundHandler = () => this.handlePoolSearch(tabId);
            searchInput.addEventListener('input', searchInput._boundHandler);

            console.log(`Search bound for tab: ${tabId}`);
        } else {
            console.warn(`Search input not found for tab: ${tabId}`);
        }

        // Bind filter select
        const filterSelect = document.getElementById(`vesselFilter-${tabId}`);
        if (filterSelect) {
            // Remove any existing listeners
            filterSelect.removeEventListener('change', filterSelect._boundHandler);

            // Create and store the handler
            filterSelect._boundHandler = () => this.handlePoolSearch(tabId);
            filterSelect.addEventListener('change', filterSelect._boundHandler);

            console.log(`Filter bound for tab: ${tabId}`);
        } else {
            console.warn(`Filter select not found for tab: ${tabId}`);
        }
    }

    refreshPoolData(poolName) {
        const tabId = poolName.toLowerCase().replace(/\s+/g, '-');

        // Reset search box
        const searchInput = document.getElementById(`searchVessels-${tabId}`);
        if (searchInput) {
            searchInput.value = '';
        }

        // Reset filter to "All Status"
        const filterSelect = document.getElementById(`vesselFilter-${tabId}`);
        if (filterSelect) {
            filterSelect.value = '';
        }

        // Clear all vessel selections
        this.selectedVessels.clear();

        // Refresh the pool display
        this.updatePoolDisplay(poolName, tabId);
        this.bindPoolControls(tabId);

        this.showNotification(`${poolName} data refreshed!`, 'success');
    }

    exportPoolData(poolName) {
        const vessels = this.vesselManager.getVesselsByPool(poolName);
        const exportData = {
            pool: poolName,
            vessels: vessels,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `fueleu_${poolName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.style.visibility = 'hidden';
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);

        this.showNotification(`${poolName} data exported!`, 'success');
    }

    filterAndDisplayVessels(tabId) {
        const activeTab = document.querySelector('.pool-tab-content.active');
        const poolName = activeTab?.dataset.pool;

        if (!poolName) return;

        // Get base vessels for this pool
        let vessels = this.vesselManager.getVesselsByPool(poolName);

        // Apply user access filtering
        if (this.authManager && this.authManager.userRole !== 'admin') {
            const currentUser = this.userManager.getUser(this.authManager.currentUser);
            vessels = vessels.filter(vessel =>
                currentUser && currentUser.pools.includes(vessel.pool)
            );
        }

        // Apply search filter
        const searchInput = document.getElementById(`searchVessels-${tabId}`);
        const searchQuery = searchInput?.value?.trim().toLowerCase() || '';

        if (searchQuery) {
            vessels = vessels.filter(vessel => {
                const vesselName = (vessel.name || '').toLowerCase();
                const vesselIMO = (vessel.imo || '').toString();

                return vesselName.includes(searchQuery) ||
                    vesselIMO.includes(searchQuery);
            });
        }

        // Debug logging to help troubleshoot
        console.log('Search query:', searchQuery);
        console.log('Vessels after search filter:', vessels.length);
        console.log('Sample vessel names:', vessels.slice(0, 3).map(v => v.name));

        // Calculate compliance for filtered vessels
        const compliance = this.calculator.calculatePoolCompliance(vessels, this.currentYear);
        let filteredVessels = compliance.vessels;

        // Apply status filter
        const filterSelect = document.getElementById(`vesselFilter-${tabId}`);
        const statusFilter = filterSelect?.value || '';

        if (statusFilter) {
            filteredVessels = compliance.vessels.filter(v => v.status === statusFilter);
        }

        // Update display
        this.displayPoolVessels(filteredVessels, tabId);
        this.updatePoolStats(compliance.summary, tabId);
    }

    handlePoolSearch(tabId) {
        const activeTab = document.querySelector('.pool-tab-content.active');
        const poolName = activeTab?.dataset.pool;

        if (!poolName) return;

        // Get base vessels for this pool
        let vessels = this.vesselManager.getVesselsByPool(poolName);

        // Apply user access filtering
        if (this.authManager && this.authManager.userRole !== 'admin') {
            const currentUser = this.userManager.getUser(this.authManager.currentUser);
            vessels = vessels.filter(vessel =>
                currentUser && currentUser.pools.includes(vessel.pool)
            );
        }

        // Apply search filter
        const searchInput = document.getElementById(`searchVessels-${tabId}`);
        const searchQuery = searchInput?.value?.trim().toLowerCase() || '';

        if (searchQuery) {
            vessels = vessels.filter(vessel => {
                const vesselName = (vessel.name || '').toLowerCase();
                const vesselIMO = (vessel.imo || '').toString().toLowerCase();

                return vesselName.includes(searchQuery) ||
                    vesselIMO.includes(searchQuery);
            });

            console.log(`Search for "${searchQuery}" found ${vessels.length} vessels`);
        }

        // Calculate compliance for all filtered vessels
        const compliance = this.calculator.calculatePoolCompliance(vessels, this.currentYear);
        let finalVessels = compliance.vessels;

        // Apply status filter after compliance calculation
        const filterSelect = document.getElementById(`vesselFilter-${tabId}`);
        const statusFilter = filterSelect?.value || '';

        if (statusFilter) {
            finalVessels = compliance.vessels.filter(v => v.status === statusFilter);

            // Recalculate pool stats for filtered vessels only
            const filteredCompliance = this.calculator.calculatePoolCompliance(
                finalVessels.map(v => this.vesselManager.getVessel(v.id)).filter(Boolean),
                this.currentYear
            );
            this.updatePoolStats(filteredCompliance.summary, tabId);
        } else {
            // Use full compliance stats when no filter applied
            this.updatePoolStats(compliance.summary, tabId);
        }

        // Update display
        this.displayPoolVessels(finalVessels, tabId);
    }

    cleanupSelections() {
        // Remove selections for vessels that no longer exist
        const existingVesselIds = new Set(this.vesselManager.getAllVessels().map(v => v.id));

        this.selectedVessels.forEach(vesselId => {
            if (!existingVesselIds.has(vesselId)) {
                this.selectedVessels.delete(vesselId);
            }
        });

        this.refreshSelectionDisplay();
    }

    // Export all system data
    exportAllData() {
        try {
            const exportData = {
                metadata: {
                    exportDate: new Date().toISOString(),
                    version: '1.0',
                    systemType: 'FuelEU Maritime Compliance System'
                },
                vessels: this.vesselManager.getAllVessels(),
                pools: this.poolManager.getAllPools(),
                users: this.userManager.getAllUsers().map(user => ({
                    ...user,
                    // Don't export passwords for security
                    password: undefined
                }))
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // const timestamp = new Date().toISOString().split('T')[0];
            // const filename = `fueleu-backup-${timestamp}.json`;
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
            const filename = `fueleu-backup-${dateStr}_${timeStr}.json`;

            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);

            this.showNotification(`System data exported as ${filename}`, 'success');

        } catch (error) {
            console.error('Export failed:', error);
            alert(`Export failed: ${error.message}`);
        }
    }

    // Import system data from file
    importAllData() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.visibility = 'hidden';

        fileInput.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importData = JSON.parse(e.target.result);
                    this.processImportData(importData);
                } catch (error) {
                    console.error('Import parsing failed:', error);
                    alert('Import failed: Invalid JSON file format');
                }
            };

            reader.onerror = () => {
                alert('Import failed: Could not read file');
            };

            reader.readAsText(file);
        };

        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    // Process imported data
    processImportData(importData) {
        try {
            // Validate import data structure
            if (!importData.metadata || !importData.vessels || !importData.pools || !importData.users) {
                throw new Error('Invalid backup file structure');
            }

            const confirmMessage = `Import data from ${new Date(importData.metadata.exportDate).toLocaleString()}?\n\nThis will replace all current data except admin settings.\n\nVessels: ${importData.vessels.length}\nPools: ${importData.pools.length}\nUsers: ${importData.users.length}`;

            if (!confirm(confirmMessage)) {
                return;
            }

            // Clear existing data (except admin)
            this.clearNonAdminData();

            // Import pools first (skip if exists)
            if (importData.pools && importData.pools.length > 0) {
                importData.pools.forEach(pool => {
                    try {
                        if (!this.poolManager.getPool(pool.name)) {
                            this.poolManager.createPool(pool);
                        }
                    } catch (error) {
                        console.warn(`Failed to import pool ${pool.name}:`, error);
                    }
                });
            }

            // Import users and create corresponding auth users
            if (importData.users && importData.users.length > 0) {
                importData.users.forEach(user => {
                    if (user.id !== 'admin') { // Don't overwrite admin
                        try {
                            // Add to UserManager
                            if (!this.userManager.getUser(user.id)) {
                                this.userManager.createUser({
                                    id: user.id,
                                    name: user.name,
                                    role: user.role,
                                    pools: user.pools
                                });

                                // Add to AuthManager with default password
                                this.authManager.addUser(user.id, {
                                    password: 'user123', // Default password for imported users
                                    role: user.role,
                                    pools: user.pools
                                });
                            }
                        } catch (error) {
                            console.warn(`Failed to import user ${user.id}:`, error);
                        }
                    }
                });
            }

            // Import vessels last (after pools and users exist)
            if (importData.vessels && importData.vessels.length > 0) {
                importData.vessels.forEach(vessel => {
                    try {
                        this.vesselManager.addVessel(vessel);
                    } catch (error) {
                        console.warn(`Failed to import vessel ${vessel.name}:`, error);
                    }
                });
            }

            // After importing pools and users, sync admin pools
            this.syncAdminPools();

            // Refresh all displays
            this.refreshAllDisplays();

            this.showNotification(`Import completed! Imported ${importData.vessels.length} vessels, ${importData.pools.length} pools, ${importData.users.length} users`, 'success');

        } catch (error) {
            console.error('Import processing failed:', error);
            alert(`Import failed: ${error.message}`);
        }
    }

    // Clear non-admin data
    clearNonAdminData() {
        // Clear vessels
        this.vesselManager.getAllVessels().forEach(vessel => {
            this.vesselManager.removeVessel(vessel.id);
        });

        // Clear non-default pools
        this.poolManager.getAllPools().forEach(pool => {
            if (!['Pool A', 'Pool B'].includes(pool.name)) {
                this.poolManager.deletePool(pool.name);
            }
        });

        // Clear non-default users
        this.userManager.getAllUsers().forEach(user => {
            if (!['admin', 'user1', 'user2'].includes(user.id)) {
                this.userManager.deleteUser(user.id);
                this.authManager.deleteUser(user.id);
            }
        });

        // Clear selections
        this.selectedVessels.clear();
    }

    // Refresh all management displays
    refreshAllDisplays() {
        // Update pool lists in forms
        this.updatePoolLists();

        // Refresh management displays if visible
        if (document.getElementById('poolManagementList')) {
            this.displayPoolManagement();
        }

        if (document.getElementById('userManagementList')) {
            this.displayUserManagement();
        }

        // Regenerate tabs to reflect new pools
        setTimeout(() => {
            this.generatePoolTabs();
        }, 100);
    }

    syncAdminPools() {
        const allPools = this.poolManager.getAllPools().map(pool => pool.name);

        try {
            // Update UserManager
            this.userManager.updateUser('admin', { pools: allPools });

            // Update AuthManager
            this.authManager.updateUserData('admin', { pools: allPools });

            console.log('Admin pools synced:', allPools);
        } catch (error) {
            console.warn('Failed to sync admin pools:', error);
        }
    }

    // Add this method to your Dashboard class for CSV vessel import
    importVesselsFromCSV() {
        // Create file input for CSV files
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.csv';
        fileInput.style.visibility = 'hidden';

        fileInput.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            // Validate file type
            if (!file.name.toLowerCase().endsWith('.csv')) {
                alert('Please select a CSV file');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    this.processCSVData(e.target.result);
                } catch (error) {
                    console.error('CSV import failed:', error);
                    alert(`CSV import failed: ${error.message}`);
                }
            };
            reader.readAsText(file);
        };

        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    // Process CSV data and import vessels
    processCSVData(csvText) {
        // Parse CSV using a simple parser (you can use Papa Parse library if available)
        const lines = csvText.trim().split('\n');

        if (lines.length < 2) {
            throw new Error('CSV file must contain at least a header row and one data row');
        }

        // Parse header row
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Expected headers (flexible mapping)
        const headerMap = {
            'vessel_name': ['vessel_name', 'name', 'vessel name', 'ship_name'],
            'imo': ['imo', 'imo_number', 'imo number'],
            'type': ['type', 'vessel_type', 'vessel type', 'ship_type'],
            'fuel_consumption': ['fuel_consumption', 'fuel consumption', 'fuel_cons', 'energy', 'energy_mj'],
            'ghg_intensity': ['ghg_intensity', 'ghg intensity', 'ghg_int', 'ghg', 'co2_intensity']
        };

        // Map headers to expected fields
        const fieldMapping = {};
        for (const [expectedField, possibleHeaders] of Object.entries(headerMap)) {
            const foundHeader = headers.find(h => possibleHeaders.includes(h));
            if (foundHeader) {
                fieldMapping[expectedField] = headers.indexOf(foundHeader);
            }
        }

        // Validate required fields are present
        const requiredFields = ['vessel_name', 'imo', 'type', 'fuel_consumption', 'ghg_intensity'];
        const missingFields = requiredFields.filter(field => !(field in fieldMapping));

        if (missingFields.length > 0) {
            throw new Error(`Missing required columns: ${missingFields.join(', ')}. Please check your CSV headers.`);
        }

        // Process data rows
        const vessels = [];
        const errors = [];
        const duplicateIMOs = [];

        for (let i = 1; i < lines.length; i++) {
            try {
                const values = this.parseCSVLine(lines[i]);

                if (values.length < headers.length) {
                    errors.push(`Row ${i + 1}: Incomplete data`);
                    continue;
                }

                // Extract vessel data
                const vesselData = {
                    name: values[fieldMapping.vessel_name]?.trim(),
                    imo: values[fieldMapping.imo]?.trim(),
                    type: values[fieldMapping.type]?.trim().toLowerCase(),
                    fuelConsumption: parseFloat(values[fieldMapping.fuel_consumption]),
                    ghgIntensity: parseFloat(values[fieldMapping.ghg_intensity])
                };

                // Validate vessel data
                const validation = this.validateVesselData(vesselData, i + 1);
                if (!validation.isValid) {
                    errors.push(`Row ${i + 1}: ${validation.error}`);
                    continue;
                }

                // Check for duplicate IMO in current import
                if (vessels.some(v => v.imo === vesselData.imo)) {
                    duplicateIMOs.push(`Row ${i + 1}: Duplicate IMO ${vesselData.imo} in import file`);
                    continue;
                }

                // Check if vessel already exists in system
                if (this.vesselManager.vessels.some(v => v.imo === vesselData.imo)) {
                    duplicateIMOs.push(`Row ${i + 1}: Vessel with IMO ${vesselData.imo} already exists in system`);
                    continue;
                }

                vessels.push(vesselData);

            } catch (error) {
                errors.push(`Row ${i + 1}: ${error.message}`);
            }
        }

        // Show import summary
        this.showImportSummary(vessels, errors, duplicateIMOs);
    }

    // Parse CSV line handling quoted values
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
    }

    // Validate individual vessel data
    validateVesselData(vessel, rowNumber) {
        // Check required fields
        if (!vessel.name || vessel.name.length === 0) {
            return { isValid: false, error: 'Vessel name is required' };
        }

        if (!vessel.imo || !/^\d{7}$/.test(vessel.imo)) {
            return { isValid: false, error: 'IMO number must be exactly 7 digits' };
        }

        const validTypes = ['container', 'bulk', 'tanker', 'passenger', 'ro-ro', 'general'];
        if (!vessel.type || !validTypes.includes(vessel.type)) {
            return { isValid: false, error: `Vessel type must be one of: ${validTypes.join(', ')}` };
        }

        if (isNaN(vessel.fuelConsumption) || vessel.fuelConsumption <= 0) {
            return { isValid: false, error: 'Fuel consumption must be a positive number' };
        }

        if (isNaN(vessel.ghgIntensity) || vessel.ghgIntensity <= 0) {
            return { isValid: false, error: 'GHG intensity must be a positive number' };
        }

        return { isValid: true };
    }

    // Show import summary and confirmation
    showImportSummary(vessels, errors, duplicateIMOs) {
        let summary = `Import Summary:\n\n`;
        summary += `✅ Valid vessels ready to import: ${vessels.length}\n`;

        if (errors.length > 0) {
            summary += `❌ Rows with errors: ${errors.length}\n`;
        }

        if (duplicateIMOs.length > 0) {
            summary += `⚠️ Duplicate IMOs skipped: ${duplicateIMOs.length}\n`;
        }

        if (errors.length > 0 || duplicateIMOs.length > 0) {
            summary += `\nErrors:\n${[...errors, ...duplicateIMOs].join('\n')}`;
        }

        if (vessels.length === 0) {
            alert('No valid vessels to import. Please check your CSV file and try again.');
            return;
        }

        summary += `\n\nDo you want to proceed with importing ${vessels.length} vessel(s)?`;

        if (confirm(summary)) {
            this.importValidVessels(vessels);
        }
    }

    // Import validated vessels into the system
    importValidVessels(vessels) {
        let importedCount = 0;
        const currentPool = this.getCurrentPool();

        vessels.forEach(vesselData => {
            try {
                // Convert to the format expected by vesselManager
                const vessel = {
                    name: vesselData.name,
                    imo: vesselData.imo,
                    type: vesselData.type,
                    energy: vesselData.fuelConsumption, // Assuming energy = fuel consumption
                    ghgIntensity: vesselData.ghgIntensity,
                    poolId: currentPool.id,
                    ownerId: this.authManager.currentUser?.id || 'admin'
                };

                this.vesselManager.addVessel(vessel);
                importedCount++;

            } catch (error) {
                console.error(`Failed to import vessel ${vesselData.name}:`, error);
            }
        });

        // Refresh the display
        this.updateVesselFleet();

        // Show success message
        this.showNotification(`Successfully imported ${importedCount} vessel(s)`, 'success');
    }

    // Add this method to download CSV template
    downloadCSVTemplate() {
        const csvTemplate = `vessel_name,imo,type,fuel_consumption,ghg_intensity
"MV Ocean Star",1234567,container,85000,75.5
"Bulk Carrier Alpha",2345678,bulk,92000,82.3
"Tanker Beta",3456789,tanker,78000,71.2
"Passenger Ferry",4567890,passenger,45000,68.9
"RoRo Gamma",5678901,ro-ro,55000,74.1

# Instructions:
# vessel_name: Name of the vessel (use quotes if contains commas)
# imo: 7-digit IMO number (must be unique)
# type: container, bulk, tanker, passenger, ro-ro, or general
# fuel_consumption: Annual fuel consumption in MJ (positive number)
# ghg_intensity: GHG intensity in gCO2e/MJ (positive number)`;

        const blob = new Blob([csvTemplate], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'vessel-import-template.csv';
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);

        this.showNotification('CSV template downloaded successfully', 'success');
    }

}