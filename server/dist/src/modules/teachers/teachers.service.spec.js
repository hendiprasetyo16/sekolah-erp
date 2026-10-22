"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const teachers_service_1 = require("./teachers.service");
describe('TeachersService', () => {
    let service;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [teachers_service_1.TeachersService],
        }).compile();
        service = module.get(teachers_service_1.TeachersService);
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
//# sourceMappingURL=teachers.service.spec.js.map