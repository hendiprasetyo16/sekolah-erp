import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('teachers')
@UseGuards(JwtAuthGuard)
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get()
  async list(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    
    const result = await this.teachersService.list(req.user.schoolId, p, l, search);
    return { success: true, ...result };
  }

  @Get(':id')
  async getById(@Request() req: any, @Param('id') id: string) {
    const data = await this.teachersService.getById(id, req.user.schoolId);
    return { success: true, data };
  }

  @Post()
  async create(@Request() req: any, @Body() data: any) {
    const result = await this.teachersService.create(req.user.schoolId, data);
    return { success: true, data: result, message: 'Teacher created' };
  }

  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() data: any) {
    const result = await this.teachersService.update(id, req.user.schoolId, data);
    return { success: true, data: result, message: 'Teacher updated' };
  }

  @Delete(':id')
  async delete(@Request() req: any, @Param('id') id: string) {
    await this.teachersService.delete(id, req.user.schoolId);
    return { success: true, message: 'Teacher deleted' };
  }
}
