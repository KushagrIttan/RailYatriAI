using RailBlockAI.Api.Models;
using RailBlockAI.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient(); // Required for OptimizationController to call Python API
builder.Services.AddScoped<IDataSeeder, JsonDataSeeder>();

// CORS — allow the frontend dev server and preview builds
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",  // Vite dev
                "http://localhost:4173",  // Vite preview
                "http://localhost:3000"   // Alternate dev port
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// CORS must come before routing/auth
app.UseCors();

app.UseAuthorization();

app.MapControllers();

// Run Seeding on startup
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var seeder = services.GetRequiredService<IDataSeeder>();
    await seeder.SeedAsync();
}

app.Run();
