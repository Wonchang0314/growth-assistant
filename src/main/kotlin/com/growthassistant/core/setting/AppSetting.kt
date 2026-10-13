package com.growthassistant.core.setting

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.springframework.data.jpa.repository.JpaRepository

/** 실행 중에 정해지는 키-값 설정 (예: 자동 생성한 Discord 채널 ID). */
@Entity
@Table(name = "app_setting")
class AppSetting(
    @Id
    @Column(name = "key")
    val key: String,
    @Column(name = "value", nullable = false)
    var value: String,
)

interface AppSettingRepository : JpaRepository<AppSetting, String>
