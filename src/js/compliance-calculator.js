export default class ComplianceCalculator {
    constructor() {
        // Official FuelEU Maritime reduction targets
        this.complianceTargets = {
            2025: 0.02,   // 2% reduction
            2026: 0.02,   // 2% reduction
            2027: 0.02,  // 2% reduction (first major step)
            2028: 0.02,  // 2% reduction (maintained)
            2029: 0.02,  // 2% reduction (maintained)
            2030: 0.06,   // 6% reduction (final target)
            2031: 0.06,   // 6% reduction (post-2030)
            2032: 0.06    // 6% reduction (post-2030)
        };

        // FuelEU Maritime baseline GHG intensity
        this.referenceGHGIntensity = 91.16; // gCO2e/MJ baseline

        // Penalty rates (EUR per tonne CO2eq deficit)
        this.penaltyRates = {
            2025: 640,  // EUR per tonne CO2eq deficit
            2026: 640,
            2027: 640,
            2028: 640,
            2029: 640,
            2030: 640
        };

        // Banking and borrowing limits
        this.bankingLimit = 0.05; // 5% of annual fuel consumption
        this.borrowingLimit = 0.05; // 5% of annual fuel consumption
    }

    /**
     * Calculate compliance for a single vessel
     */
    calculateVesselCompliance(vessel, year = 2025) {
        if (!this.complianceTargets[year]) {
            throw new Error(`Invalid compliance year: ${year}`);
        }

        const target = this.complianceTargets[year];
        const targetIntensity = this.referenceGHGIntensity * (1 - target);

        // Calculate deviation
        const deviation = targetIntensity - vessel.ghgIntensity;
        const deviationPercent = (deviation / targetIntensity) * 100;

        // NEW: Calculate compliance balance in tCO2eq (negative = deficit, positive = surplus)
        const complianceBalance = (deviation * vessel.fuelConsumption) / 1000000; // tCO2eq

        // Simplified two-level compliance determination
        // Negative = deficit (non-compliant), Zero/Positive = surplus (compliant)
        let status;
        if (complianceBalance < 0) {
            status = 'non-compliant';
        } else {
            status = 'compliant';
        }

        // Calculate energy deficit/surplus (MJ) - keep for reference
        const energyDeficit = Math.max(0, deviation * vessel.fuelConsumption);
        const energySurplus = Math.max(0, -deviation * vessel.fuelConsumption);

        // Penalty = 640 EUR per tonne of CO2eq deficit
        // Calculate potential penalty based on negative compliance balance (deficit only)
        // Penalty only applies when CB < 0 (deficit/non-compliant)
        const penaltyRate = this.penaltyRates[year] || this.penaltyRates[2030];
        const potentialPenalty = complianceBalance < 0 ? Math.abs(complianceBalance) * penaltyRate / 1000000 : 0; // Convert to EUR millions

        return {
            ...vessel,
            complianceYear: year,
            targetIntensity: Number(targetIntensity.toFixed(2)),
            deviation: Number(deviation.toFixed(3)),
            deviationPercent: Number(deviationPercent.toFixed(2)),

            // Energy values (MJ) - keep for reference
            energyDeficit: Number(energyDeficit.toFixed(0)),
            energySurplus: Number(energySurplus.toFixed(0)),

            // NEW: Compliance balance (tCO2eq) - negative = surplus, positive = deficit
            complianceBalance: Number(complianceBalance.toFixed(2)),

            potentialPenalty: Number(potentialPenalty.toFixed(2)),
            status,
            complianceScore: this.calculateComplianceScore(vessel.ghgIntensity, targetIntensity)
        };
    }

    /**
     * Calculate compliance score (0-100)
     */
    calculateComplianceScore(actualIntensity, targetIntensity) {
        if (actualIntensity <= targetIntensity) {
            // Bonus points for exceeding compliance
            const surplusPercent = (targetIntensity - actualIntensity) / targetIntensity;
            return Math.min(100, 100 + surplusPercent * 20);
        } else {
            // Penalty for non-compliance
            const deficitPercent = (actualIntensity - targetIntensity) / targetIntensity;
            return Math.max(0, 100 - deficitPercent * 100);
        }
    }

    /**
     * Calculate compliance for a pool of vessels
     */
    calculatePoolCompliance(vessels, year = 2025) {
        if (!vessels || vessels.length === 0) {
            return this.getEmptyPoolResult(year);
        }

        let totalEnergyConsumption = 0;
        let totalEmissions = 0;
        let totalEnergyDeficit = 0;
        let totalEnergySurplus = 0;
        let totalComplianceBalance = 0;  // NEW: tCO2eq (negative = surplus, positive = deficit)
        let totalPotentialPenalty = 0;
        let compliantCount = 0;
        let nonCompliantCount = 0;

        let totalDeficitFromVessels = 0;
        let totalSurplusFromVessels = 0;

        const vesselResults = vessels.map(vessel => {
            const result = this.calculateVesselCompliance(vessel, year);

            // Accumulate totals
            totalEnergyConsumption += vessel.fuelConsumption;
            totalEmissions += vessel.fuelConsumption * vessel.ghgIntensity;
            totalEnergyDeficit += result.energyDeficit;
            totalEnergySurplus += result.energySurplus;
            totalComplianceBalance += result.complianceBalance;
            totalPotentialPenalty += result.potentialPenalty;

            // Separate deficit and surplus totals
            if (result.complianceBalance < 0) {
                totalDeficitFromVessels += Math.abs(result.complianceBalance);
            } else if (result.complianceBalance > 0) {
                totalSurplusFromVessels += result.complianceBalance;
            }

            // Count by status
            if (result.status === 'compliant') {
                compliantCount++;
            } else {
                nonCompliantCount++;
            }

            return result;
        });

        // Calculate pool-level metrics
        const poolAverageIntensity = totalEmissions / totalEnergyConsumption;
        const target = this.complianceTargets[year];
        const poolTargetIntensity = this.referenceGHGIntensity * (1 - target);
        // Pool is compliant if net compliance balance is zero or positive (surplus)
        const poolCompliant = totalComplianceBalance >= 0;

        // Net pool position
        const netEnergyDeficit = Math.max(0, totalEnergyDeficit - totalEnergySurplus);
        const netEnergySurplus = Math.max(0, totalEnergySurplus - totalEnergyDeficit);
        //const netComplianceDeficit = Math.max(0, totalComplianceDeficit - totalComplianceSurplus);  // NEW
        // const netComplianceSurplus = Math.max(0, totalComplianceSurplus - totalComplianceDeficit);  // NEW

        // Pool compliance score
        const poolComplianceScore = this.calculateComplianceScore(poolAverageIntensity, poolTargetIntensity);

        return {
            vessels: vesselResults,
            summary: {
                totalVessels: vessels.length,
                compliantVessels: compliantCount,
                nonCompliantVessels: nonCompliantCount,
                complianceRate: Number(((compliantCount / vessels.length) * 100).toFixed(1)),

                // Energy metrics (MJ) - keep for reference
                totalEnergyConsumption: Number(totalEnergyConsumption.toFixed(0)),
                totalEmissions: Number(totalEmissions.toFixed(0)),
                poolEnergyDeficit: Number((totalEnergyDeficit / 1000000).toFixed(2)),
                poolEnergySurplus: Number((totalEnergySurplus / 1000000).toFixed(2)),
                netEnergyDeficit: Number((netEnergyDeficit / 1000000).toFixed(2)),
                netEnergySurplus: Number((netEnergySurplus / 1000000).toFixed(2)),

                // Pool compliance balance (tCO2eq)
                poolComplianceBalance: Number(totalComplianceBalance.toFixed(2)),
                poolComplianceDeficit: Number(totalDeficitFromVessels.toFixed(2)), // Sum of vessel deficits
                poolComplianceSurplus: Number(totalSurplusFromVessels.toFixed(2)), // Sum of vessel surpluses

                // Intensity metrics
                poolAverageIntensity: Number(poolAverageIntensity.toFixed(2)),
                poolTargetIntensity: Number(poolTargetIntensity.toFixed(2)),
                poolDeviation: Number((poolAverageIntensity - poolTargetIntensity).toFixed(2)),
                poolCompliant,
                poolComplianceScore: Number(poolComplianceScore.toFixed(1)),

                // Financial metrics
                poolPotentialPenalty: totalComplianceBalance < 0 ? Number((Math.abs(totalComplianceBalance) * (this.penaltyRates[year] || this.penaltyRates[2030]) / 1000000).toFixed(2)) : 0,
                totalPotentialPenalty: Number(totalPotentialPenalty.toFixed(2)),

                // Analysis year
                complianceYear: year,
                reductionTarget: Number((target * 100).toFixed(1))
            }
        };
    }

    /**
     * Get empty pool result structure
     */
    getEmptyPoolResult(year) {
        const target = this.complianceTargets[year] || this.complianceTargets[2025];
        return {
            vessels: [],
            summary: {
                totalVessels: 0,
                compliantVessels: 0,
                nonCompliantVessels: 0,
                complianceRate: 0,
                totalEnergyConsumption: 0,
                totalEmissions: 0,
                poolEnergyDeficit: 0,
                poolEnergySurplus: 0,
                netEnergyDeficit: 0,
                netEnergySurplus: 0,
                poolComplianceBalance: 0,
                poolComplianceDeficit: 0,
                poolComplianceSurplus: 0,
                poolPotentialPenalty: 0, // ADD THIS MISSING PROPERTY
                poolAverageIntensity: 0,
                poolTargetIntensity: this.referenceGHGIntensity * (1 - target),
                poolDeviation: 0,
                poolCompliant: true, // Empty pool is technically compliant
                poolComplianceScore: 0,
                totalPotentialPenalty: 0,
                totalVesselPenalties: 0, // ADD THIS TOO
                complianceYear: year,
                reductionTarget: (target * 100).toFixed(1)
            }
        };
    }

    /**
     * Calculate year-over-year compliance trend
     */
    calculateComplianceTrend(vessels, startYear = 2025, endYear = 2030) {
        const trendData = [];

        for (let year = startYear; year <= endYear; year++) {
            if (this.complianceTargets[year]) {
                const compliance = this.calculatePoolCompliance(vessels, year);
                trendData.push({
                    year,
                    complianceRate: compliance.summary.complianceRate,
                    poolCompliant: compliance.summary.poolCompliant,
                    totalPenalty: compliance.summary.totalPotentialPenalty,
                    reductionTarget: compliance.summary.reductionTarget,
                    poolAverageIntensity: compliance.summary.poolAverageIntensity,
                    poolTargetIntensity: compliance.summary.poolTargetIntensity
                });
            }
        }

        return trendData;
    }

    /**
     * Suggest improvements for non-compliant vessels
     */
    suggestImprovements(vessel, year = 2025) {
        const compliance = this.calculateVesselCompliance(vessel, year);

        if (compliance.status === 'compliant') {
            return {
                status: 'compliant',
                suggestions: ['Vessel is already compliant. Consider maintaining current fuel efficiency.']
            };
        }

        const target = this.complianceTargets[year];
        const targetIntensity = this.referenceGHGIntensity * (1 - target);
        const requiredReduction = vessel.ghgIntensity - targetIntensity;
        const requiredReductionPercent = (requiredReduction / vessel.ghgIntensity) * 100;

        const suggestions = [];

        if (requiredReductionPercent <= 5) {
            suggestions.push('Consider operational efficiency improvements (route optimization, speed management)');
            suggestions.push('Implement energy management systems');
        } else if (requiredReductionPercent <= 15) {
            suggestions.push('Consider alternative fuel blending (biofuels, e-fuels)');
            suggestions.push('Upgrade to more efficient marine engines');
            suggestions.push('Install energy recovery systems');
        } else {
            suggestions.push('Significant fuel transition required (ammonia, hydrogen, methanol)');
            suggestions.push('Consider vessel retrofit or replacement');
            suggestions.push('Implement comprehensive decarbonization strategy');
        }

        suggestions.push(`Target: Reduce GHG intensity by ${requiredReductionPercent.toFixed(1)}% to ${targetIntensity.toFixed(2)} gCO2e/MJ`);

        return {
            status: compliance.status,
            requiredReduction: requiredReduction.toFixed(2),
            requiredReductionPercent: requiredReductionPercent.toFixed(1),
            targetIntensity: targetIntensity.toFixed(2),
            suggestions
        };
    }

    /**
     * Calculate banking and borrowing opportunities
     */
    calculateBankingBorrowing(vessel, year = 2025) {
        const compliance = this.calculateVesselCompliance(vessel, year);

        // Banking capacity (for compliant vessels with surplus)
        let bankingCapacity = 0;
        if (compliance.energySurplus > 0) {
            bankingCapacity = Math.min(
                compliance.energySurplus,
                vessel.fuelConsumption * this.bankingLimit
            );
        }

        // Borrowing capacity (for non-compliant vessels)
        let borrowingCapacity = 0;
        if (compliance.energyDeficit > 0) {
            borrowingCapacity = Math.min(
                compliance.energyDeficit,
                vessel.fuelConsumption * this.borrowingLimit
            );
        }

        return {
            canBank: bankingCapacity > 0,
            bankingCapacity: Number(bankingCapacity.toFixed(0)),
            canBorrow: borrowingCapacity > 0,
            borrowingCapacity: Number(borrowingCapacity.toFixed(0)),
            bankingLimitMJ: Number((vessel.fuelConsumption * this.bankingLimit).toFixed(0)),
            borrowingLimitMJ: Number((vessel.fuelConsumption * this.borrowingLimit).toFixed(0))
        };
    }

    /**
     * Get available compliance years
     */
    getAvailableYears() {
        return Object.keys(this.complianceTargets).map(year => ({
            year: parseInt(year),
            target: this.complianceTargets[year],
            targetPercent: (this.complianceTargets[year] * 100).toFixed(1)
        }));
    }

    /**
     * Validate compliance calculation inputs
     */
    validateInputs(vessel, year) {
        const errors = [];

        if (!vessel) {
            errors.push('Vessel data is required');
            return errors;
        }

        if (!vessel.fuelConsumption || vessel.fuelConsumption <= 0) {
            errors.push('Valid fuel consumption is required');
        }

        if (!vessel.ghgIntensity || vessel.ghgIntensity <= 0) {
            errors.push('Valid GHG intensity is required');
        }

        if (!this.complianceTargets[year]) {
            errors.push(`Invalid compliance year: ${year}`);
        }

        return errors;
    }
}