/*
 * This file is a part of "NMIG" - the database migration tool.
 *
 * Copyright (C) 2016 - present, Anatoly Khaytovich <anatolyuss@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program (please see the "LICENSE.md" file).
 * If not, see <http://www.gnu.org/licenses/gpl.txt>.
 *
 * @author Anatoly Khaytovich <anatolyuss@gmail.com>
 */
'use strict';

const path                                  = require('path');
const connect                               = require('../../src/Connector');
const Main                                  = require('../../src/Main');
const SchemaProcessor                       = require('../../src/SchemaProcessor');
const readDataTypesMap                      = require('../../src/DataTypesMapReader');
const loadStructureToMigrate                = require('../../src/StructureLoader');
const pipeData                              = require('../../src/DataPipeManager');
const { createStateLogsTable }              = require('../../src/MigrationStateManager');
const { createDataPoolTable, readDataPool } = require('../../src/DataPoolManager');
const generateError                         = require('../../src/ErrorGenerator');

module.exports = class TestSchemaLoader {

    /**
     * TestSchemaLoader constructor.
     */
    constructor() {
        this._app = new Main();
    }

    /**
     * Creates test source database.
     *
     * @param {Conversion} conversion
     *
     * @returns {Promise<Conversion>}
     */
    createTestSourceDb(conversion) {
        return connect(conversion).then(() => {
            return new Promise(resolve => {
                conversion._mysql.getConnection((error, connection) => {
                    if (error) {
                        // The connection is undefined.
                        generateError(conversion, `\t--[createTestSourceDb] Cannot connect to MySQL server...\n ${ error }`);
                        process.exit();
                    }

                    connection.query(`CREATE DATABASE IF NOT EXISTS nmig_test_db;`, err => {
                        connection.release();

                        if (err) {
                            // Failed to create test source database.
                            generateError(conversion, `\t--[createTestSourceDb] Cannot create test MySQL database...\n ${ err }`);
                            process.exit();
                        }

                        conversion._mysql                    = null;
                        conversion._sourceConString.database = 'nmig_test_db';
                        resolve(conversion);
                    });
                });
            });
        });
    }

    /**
     * Creates test target database.
     *
     * @param {Conversion} conversion
     *
     * @returns {Promise<Conversion>}
     */
    createTestTargetDb(conversion) {
        conversion._pg                       = null;
        conversion._targetConString.database = 'postgres';

        return connect(conversion).then(() => {
            return new Promise(resolve => {
                conversion._pg.connect((error, client, done) => {
                    if (error) {
                        generateError(conversion, `\t--[createTestTargetDb] Cannot create test PostgreSQL database...\n ${ error }`);
                        process.exit();
                    }

                    client.query(`SELECT 1 FROM pg_database WHERE datname = 'nmig_test_db';`, (err, result) => {
                        if (err) {
                            generateError(conversion, `\t--[createTestTargetDb] ${ err }`);
                            process.exit();
                        }

                        if (result.rows.length === 0) {
                            // Database 'nmig_test_db' does not exist.
                            client.query(`CREATE DATABASE nmig_test_db;`, createDbError => {
                                done();

                                if (createDbError) {
                                    generateError(conversion, `\t--[createTestTargetDb] Cannot create test PostgreSQL database...\n ${ createDbError }`);
                                    process.exit();
                                }

                                conversion._pg                       = null;
                                conversion._targetConString.database = 'nmig_test_db';
                                resolve(conversion);
                            });

                        } else {
                            done();
                            conversion._pg                       = null;
                            conversion._targetConString.database = 'nmig_test_db';
                            resolve(conversion);
                        }
                    });
                });
            });
        });
    }

    /**
     * Loads test schema.
     *
     * @returns {undefined}
     */
    loadTestSchema() {
        const baseDir = path.join(__dirname, '..', '..');

        this._app.readConfig(baseDir, 'test_config.json')
            .then(config => this._app.readExtraConfig(config, baseDir))
            .then(this._app.initializeConversion)
            .then(this.createTestSourceDb)
            .then(this.createTestTargetDb)
            .then(readDataTypesMap)
            .then(this._app.createLogsDirectory)
            .then(conversion => (new SchemaProcessor(conversion)).createSchema())
            .then(createStateLogsTable)
            .then(createDataPoolTable)
            .then(loadStructureToMigrate)
            .then(readDataPool)
            .then(pipeData)
            .catch(error => console.log(error));
    }
};
